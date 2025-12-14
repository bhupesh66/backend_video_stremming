/**
 * Hive Streaming – Complete Production-Ready Telemetry Plugin
 * NOW UPDATED TO ALWAYS SEND QUALITY INFO FOR EVERY EVENT
 */

class TelemetryPlugin {
    constructor(hls, videoElement, viewerId = "unknown-viewer", config = {}) {
        this.hls = hls;
        this.video = videoElement;
        this.viewerId = viewerId;

        this.sessionId = "session-" + Math.random().toString(36).slice(2);

        // Store the last known quality (ALWAYS sent in every event)
        this.currentQuality = {
            bitrateKbps: null,
            width: null,
            height: null,
            resolution: null
        };

        // Buffer tracking
        this.bufferStartTime = null;

        // Engagement tracking
        this.lastPlayTimestamp = null;
        this.totalWatchTime = 0;
        this.totalPauseTime = 0;
        this.lastPauseTimestamp = null;
        this.interactionCount = 0;

        // Config defaults
        this.config = {
            endpoint: config.endpoint || "http://localhost:3000/telemetry",
            flushIntervalMs: config.flushIntervalMs || 5000,
            maxBatchSize: config.maxBatchSize || 20,
            maxQueueSize: config.maxQueueSize || 1500,
            maxRetries: config.maxRetries || 3,
            backoffBaseMs: config.backoffBaseMs || 1000
        };

        this.eventQueue = [];
        this.isSending = false;
        this.retryTimer = null;

        console.log("🚀 TelemetryPlugin initialized:", { viewerId, session: this.sessionId });

        this.initListeners();
        this.startFlushTimer();
        window.addEventListener("online", () => this.flushQueue());
    }

    // --------------------------------------------------------
    //  ALWAYS INCLUDE QUALITY IN EVERY EVENT
    // --------------------------------------------------------
    base(eventType) {
        return {
            viewerId: this.viewerId,
            sessionId: this.sessionId,
            eventType,
            timestamp: Date.now(),
            playbackPositionSec: this.video.currentTime ?? null,

            // 🔥 Add this ALWAYS
            quality: this.currentQuality,

            engagement: {
                totalWatchTime: this.totalWatchTime,
                totalPauseTime: this.totalPauseTime,
                interactionCount: this.interactionCount
            },

            network: this.getNetworkInfo(),
            device: this.getDeviceInfo(),
            player: this.getPlayerMetrics()
        };
    }

    // --------------------------------------------------------
    // NETWORK INFORMATION
    // --------------------------------------------------------
    getNetworkInfo() {
        const n = navigator.connection || navigator.webkitConnection || navigator.mozConnection;
        return n ? {
            downlinkMbps: n.downlink || null,
            rttMs: n.rtt || null,
            effectiveType: n.effectiveType || null
        } : {};
    }

    // --------------------------------------------------------
    // DEVICE INFORMATION
    // --------------------------------------------------------
    getDeviceInfo() {
        const ua = navigator.userAgent;

        let browser = "Unknown";
        if (ua.includes("Chrome") && !ua.includes("Edg") && !ua.includes("OPR")) browser = "Chrome";
        else if (ua.includes("Safari") && !ua.includes("Chrome")) browser = "Safari";
        else if (ua.includes("Firefox")) browser = "Firefox";
        else if (ua.includes("Edg")) browser = "Edge";
        else if (ua.includes("OPR") || ua.includes("Opera")) browser = "Opera";

        return {
            browser,
            os: navigator.platform || null,
            screenWidth: window.screen.width,
            screenHeight: window.screen.height
        };
    }

    // --------------------------------------------------------
    // PLAYER METRICS
    // --------------------------------------------------------
    getPlayerMetrics() {
        const stats = this.video.getVideoPlaybackQuality?.() || {};
        const buffered = this.video.buffered;

        let bufferLength = 0;
        if (buffered && buffered.length > 0) {
            const end = buffered.end(buffered.length - 1);
            bufferLength = Math.max(0, end - this.video.currentTime);
        }

        return {
            droppedFrames: stats.droppedVideoFrames || 0,
            decodedFrames: stats.totalVideoFrames || 0,
            fps: stats.totalVideoFrames ? (stats.totalVideoFrames / ((stats.totalFrameDelay || 1) / 1000)) : null,
            bufferLengthSec: bufferLength
        };
    }

    // --------------------------------------------------------
    // QUEUE LOGIC
    // --------------------------------------------------------
    enqueue(payload) {
        if (this.eventQueue.length >= this.config.maxQueueSize) {
            this.eventQueue.shift();
            console.warn("⚠️ Queue full — dropped oldest event");
        }
        payload._retryCount = payload._retryCount || 0;
        this.eventQueue.push(payload);
    }

    startFlushTimer() {
        setInterval(() => this.flushQueue(), this.config.flushIntervalMs);
    }

    async flushQueue() {
        if (this.isSending || this.eventQueue.length === 0) return;
        if (!navigator.onLine) return;

        this.isSending = true;
        const batch = this.eventQueue.splice(0, this.config.maxBatchSize);

        console.log(`📤 Sending batch of ${batch.length} events…`);

        try {
            const response = await fetch(this.config.endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(batch)
            });

            if (!response.ok) {
                console.error("❌ Server responded with error:", response.status);
                this.handleFailedBatch(batch);
            } else {
                console.log("✅ Batch sent");
            }
        } catch (err) {
            console.error("❌ Network send failed:", err);
            this.handleFailedBatch(batch);
        }

        this.isSending = false;
    }

    handleFailedBatch(batch) {
        batch.forEach(event => {
            event._retryCount++;
            if (event._retryCount <= this.config.maxRetries) {
                this.eventQueue.unshift(event);
            } else {
                console.warn("⚠️ Telemetry dropped:", event);
            }
        });

        const retry = batch[0]._retryCount;
        const delay = this.config.backoffBaseMs * Math.pow(2, retry - 1);

        console.warn(`⏳ Retrying in ${delay}ms`);

        clearTimeout(this.retryTimer);
        this.retryTimer = setTimeout(() => this.flushQueue(), delay);
    }

    log(payload) {
        console.log("📌 Telemetry Event Generated:", payload);
        this.enqueue(payload);
    }

    // --------------------------------------------------------
    // ENGAGEMENT TRACKING
    // --------------------------------------------------------
    onPlay() {
        console.log("▶️ PLAY");
        this.lastPlayTimestamp = Date.now();

        if (this.lastPauseTimestamp) {
            this.totalPauseTime += (Date.now() - this.lastPauseTimestamp);
            this.lastPauseTimestamp = null;
        }
        this.interactionCount++;
        this.log(this.base("PLAY"));
    }

    onPause() {
        console.log("⏸ PAUSE");
        this.lastPauseTimestamp = Date.now();

        if (this.lastPlayTimestamp) {
            this.totalWatchTime += (Date.now() - this.lastPlayTimestamp);
        }
        this.interactionCount++;
        this.log(this.base("PAUSE"));
    }

    // --------------------------------------------------------
    // LISTENERS
    // --------------------------------------------------------
    initListeners() {
        console.log("🎯 Initializing listeners…");

        // UPDATE QUALITY + LOG EVENT
        this.hls.on(Hls.Events.LEVEL_SWITCHED, (evt, data) => {
            const level = this.hls.levels[data.level];
            if (!level) return;

            this.currentQuality = {
                bitrateKbps: Math.round(level.bitrate / 1000),
                width: level.width,
                height: level.height,
                resolution: `${level.height}p`
            };

            console.log("🎞 QUALITY UPDATED:", this.currentQuality);

            const payload = this.base("QUALITY_CHANGE");
            payload.quality = this.currentQuality;
            this.log(payload);
        });

        // BUFFER START
        this.video.addEventListener("waiting", () => {
            this.bufferStartTime = Date.now();
            const evt = this.base("BUFFER_START");
            evt.buffering = { startedAt: this.bufferStartTime };
            this.log(evt);
        });

        // BUFFER END
        this.video.addEventListener("playing", () => {
            if (!this.bufferStartTime) return;

            const end = Date.now();
            const evt = this.base("BUFFER_END");
            evt.buffering = {
                startedAt: this.bufferStartTime,
                endedAt: end,
                durationMs: end - this.bufferStartTime
            };

            this.bufferStartTime = null;
            this.log(evt);
        });

        // PLAY / PAUSE
        this.video.addEventListener("play", () => this.onPlay());
        this.video.addEventListener("pause", () => this.onPause());

        // PLAYER ERRORS
        this.hls.on(Hls.Events.ERROR, (evt, data) => {
            const error = this.base("PLAYER_ERROR");
            error.error = {
                type: data.type,
                details: data.details,
                fatal: data.fatal
            };
            this.log(error);
        });

        console.log("✅ Listeners initialized");
    }
}
