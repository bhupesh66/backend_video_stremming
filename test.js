/**
 * Hive Streaming – Scalable & Fault-Tolerant Telemetry Plugin
 * Fully corrected version including REAL buffering detection.
 */

class TelemetryPlugin {
    constructor(hls, videoElement, viewerId = "unknown-viewer", config = {}) {
        this.hls = hls;
        this.video = videoElement;
        this.viewerId = viewerId;

        // Unique session id
        this.sessionId = "session-" + Math.random().toString(36).slice(2);

        // Track buffer start time
        this.bufferStartTime = null;

        // Configuration with defaults
        this.config = {
            endpoint: config.endpoint || "https://api.example.com/telemetry",
            flushIntervalMs: config.flushIntervalMs || 5000,
            maxBatchSize: config.maxBatchSize || 20,
            maxQueueSize: config.maxQueueSize || 1000,
            maxRetries: config.maxRetries || 3,
            backoffBaseMs: config.backoffBaseMs || 1000
        };

        // Queue for telemetry
        this.eventQueue = [];
        this.isSending = false;
        this.retryTimer = null;

        this.initListeners();
        this.startFlushTimer();

        window.addEventListener("online", () => this.flushQueue());

        console.log("🚀 TelemetryPlugin initialized for:", viewerId);
    }

    // Base telemetry event
    base(eventType) {
        return {
            viewerId: this.viewerId,
            sessionId: this.sessionId,
            eventType,
            timestamp: Date.now(),
            playbackPositionSec: this.video.currentTime ?? null
        };
    }

    // Add event to queue safely
    enqueue(payload) {
        if (this.eventQueue.length >= this.config.maxQueueSize) {
            this.eventQueue.shift();
            console.warn("⚠️ Queue full — dropped oldest event");
        }

        payload._retryCount = payload._retryCount || 0;
        this.eventQueue.push(payload);
    }

    // Batch flushing timer
    startFlushTimer() {
        setInterval(() => this.flushQueue(), this.config.flushIntervalMs);
    }

    // Send batched telemetry
    async flushQueue() {
        if (this.isSending || this.eventQueue.length === 0) return;

        if (!navigator.onLine) {
            console.warn("⚠️ Offline — delaying telemetry send");
            return;
        }

        this.isSending = true;

        const batch = this.eventQueue.splice(0, this.config.maxBatchSize);

        try {
            const response = await fetch(this.config.endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(batch)
            });

            if (!response.ok) {
                console.error("❌ Server error:", response.status);
                this.handleFailedBatch(batch);
            } else {
                console.log(`📤 Sent batch of ${batch.length} events`);
            }
        } catch (err) {
            console.error("❌ Network failure:", err);
            this.handleFailedBatch(batch);
        }

        this.isSending = false;
    }

    // Retry failed sends with exponential backoff
    handleFailedBatch(batch) {
        batch.forEach(event => {
            event._retryCount++;

            if (event._retryCount <= this.config.maxRetries) {
                this.eventQueue.unshift(event);
            } else {
                console.warn("⚠️ Dropping event after max retries:", event);
            }
        });

        const highestRetry = Math.max(...batch.map(e => e._retryCount));
        const delay = this.config.backoffBaseMs * Math.pow(2, highestRetry - 1);

        console.warn(`⏳ Retrying in ${delay} ms`);
        clearTimeout(this.retryTimer);
        this.retryTimer = setTimeout(() => this.flushQueue(), delay);
    }

    // Log any telemetry event
    log(payload) {
        console.log("📌 Telemetry:", payload);
        this.enqueue(payload);
    }

    // Initialize event listeners
    initListeners() {
        console.log("🎯 Initializing event listeners...");

        // QUALITY CHANGE (HLS)
        this.hls.on(Hls.Events.LEVEL_SWITCHED, (event, data) => {
            const level = this.hls.levels[data.level];
            if (!level) return;

            const payload = this.base("QUALITY_CHANGE");
            payload.quality = {
                levelIndex: data.level,
                bitrateKbps: Math.round(level.bitrate / 1000),
                width: level.width,
                height: level.height,
                resolution: `${level.height}p`
            };

            this.log(payload);
        });

        // REAL BUFFER START (video "waiting")
        this.video.addEventListener("waiting", () => {
            this.bufferStartTime = Date.now();

            const payload = this.base("BUFFER_START");
            payload.buffering = { startedAt: this.bufferStartTime };

            console.warn("⛔ BUFFER START — video stalled");
            this.log(payload);
        });

        // REAL BUFFER END (video "playing")
        this.video.addEventListener("playing", () => {
            if (!this.bufferStartTime) return;

            const endTime = Date.now();
            const duration = endTime - this.bufferStartTime;

            const payload = this.base("BUFFER_END");
            payload.buffering = {
                startedAt: this.bufferStartTime,
                endedAt: endTime,
                durationMs: duration
            };

            console.log(`▶️ BUFFER END — stalled ${duration}ms`);
            this.bufferStartTime = null;

            this.log(payload);
        });

        // PLAYER ERROR (HLS)
        this.hls.on(Hls.Events.ERROR, (event, data) => {
            const payload = this.base("PLAYER_ERROR");
            payload.error = {
                type: data.type,
                details: data.details,
                fatal: data.fatal
            };

            this.log(payload);
        });

        // PLAY / PAUSE events
        this.video.addEventListener("play", () => {
            this.log(this.base("PLAY"));
        });

        this.video.addEventListener("pause", () => {
            this.log(this.base("PAUSE"));
        });

        console.log("✅ Listeners initialized");
    }
}




/////


/**
 * Hive Streaming – FULL Telemetry Plugin (Quality, Buffering, Network, Device, Engagement, Player Metrics)
 */

class TelemetryPlugin {
    constructor(hls, videoElement, viewerId = "unknown-viewer", config = {}) {
        this.hls = hls;
        this.video = videoElement;
        this.viewerId = viewerId;

        this.sessionId = "session-" + Math.random().toString(36).slice(2);

        // Buffer tracking
        this.bufferStartTime = null;

        // Engagement tracking
        this.lastPlayTimestamp = null;
        this.totalWatchTime = 0;
        this.totalPauseTime = 0;
        this.lastPauseTimestamp = null;
        this.interactionCount = 0;

        // Config
        this.config = {
            endpoint: config.endpoint || "https://api.example.com/telemetry",
            flushIntervalMs: config.flushIntervalMs || 5000,
            maxBatchSize: config.maxBatchSize || 20,
            maxQueueSize: config.maxQueueSize || 1500,
            maxRetries: config.maxRetries || 3,
            backoffBaseMs: config.backoffBaseMs || 1000
        };

        // Queue & retry state
        this.eventQueue = [];
        this.isSending = false;
        this.retryTimer = null;

        this.initListeners();
        this.startFlushTimer();

        window.addEventListener("online", () => this.flushQueue());
    }

    // --------------------------------------------------------
    // BASE EVENT
    // --------------------------------------------------------

    base(eventType) {
        return {
            viewerId: this.viewerId,
            sessionId: this.sessionId,
            eventType,
            timestamp: Date.now(),
            playbackPositionSec: this.video.currentTime ?? null,

            // Add engagement
            engagement: {
                totalWatchTime: this.totalWatchTime,
                totalPauseTime: this.totalPauseTime,
                interactionCount: this.interactionCount
            },

            // Add network info
            network: this.getNetworkInfo(),

            // Add device info
            device: this.getDeviceInfo(),

            // Add player metrics
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
        return {
            browser: navigator.userAgent,
            os: navigator.platform,
            screenWidth: window.screen.width,
            screenHeight: window.screen.height
        };
    }

    // --------------------------------------------------------
    // PLAYER METRICS
    // --------------------------------------------------------
    getPlayerMetrics() {
        const stats = this.video.getVideoPlaybackQuality?.() || {};

        // Buffer length (seconds)
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
            this.eventQueue.shift(); // drop oldest
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

        try {
            const response = await fetch(this.config.endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(batch)
            });

            if (!response.ok) {
                this.handleFailedBatch(batch);
            }
        } catch (err) {
            this.handleFailedBatch(batch);
        }

        this.isSending = false;
    }

    handleFailedBatch(batch) {
        batch.forEach(evt => {
            evt._retryCount++;
            if (evt._retryCount <= this.config.maxRetries) {
                this.eventQueue.unshift(evt); // retry later
            }
        });

        const delay = this.config.backoffBaseMs * (2 ** (batch[0]._retryCount - 1));
        clearTimeout(this.retryTimer);
        this.retryTimer = setTimeout(() => this.flushQueue(), delay);
    }

    log(payload) {
        this.enqueue(payload);
    }

    // --------------------------------------------------------
    // ENGAGEMENT TRACKING
    // --------------------------------------------------------

    onPlay() {
        this.lastPlayTimestamp = Date.now();

        // If video was paused — add pause duration
        if (this.lastPauseTimestamp) {
            this.totalPauseTime += (Date.now() - this.lastPauseTimestamp);
            this.lastPauseTimestamp = null;
        }

        this.interactionCount++;

        this.log(this.base("PLAY"));
    }

    onPause() {
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
        // QUALITY CHANGE
        this.hls.on(Hls.Events.LEVEL_SWITCHED, (evt, data) => {
            const level = this.hls.levels[data.level];
            if (!level) return;

            const payload = this.base("QUALITY_CHANGE");
            payload.quality = {
                bitrateKbps: Math.round(level.bitrate / 1000),
                width: level.width,
                height: level.height,
                resolution: `${level.height}p`
            };

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
    }
}


