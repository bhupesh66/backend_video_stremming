const express = require("express");
const cors = require("cors");
const pool = require("./db");

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.post("/telemetry", async (req, res) => {
  const events = Array.isArray(req.body) ? req.body : [req.body];

  try {
    for (const e of events) {
      console.log("\nRAW EVENT RECEIVED ");
      console.log(JSON.stringify(e, null, 2));
            


      // Core identifiers (frontend provided)
     
      const eventId = e.eventId;
      const viewerId = e.viewerId ?? null;
      const sessionId = e.sessionId ?? null;
      const eventType = e.eventType ?? null;
      const eventTimestamp = e.timestamp ?? null;
      const playbackPosition = e.playbackPositionSec ?? null;


      // Quality
    
      const bitrate = e.quality?.bitrateKbps ?? null;
      const resolution = e.quality?.resolution ?? null;
      const videoWidth = e.quality?.width ?? null;
      const videoHeight = e.quality?.height ?? null;

  
      // Buffering
   
      const bufferStart = e.buffering?.startedAt ?? null;
      const bufferEnd = e.buffering?.endedAt ?? null;
      const bufferDuration = e.buffering?.durationMs ?? null;


      // Network
      
      const netDown = e.network?.downlinkMbps ?? null;
      const netRtt = e.network?.rttMs ?? null;
      const netType = e.network?.effectiveType ?? null;


      // Device
   
      const browser = e.device?.browser ?? null;
      const os = e.device?.os ?? null;
      const screenW = e.device?.screenWidth ?? null;
      const screenH = e.device?.screenHeight ?? null;


      // Engagement

      const watchTime = e.engagement?.totalWatchTime ?? null;
      const pauseTime = e.engagement?.totalPauseTime ?? null;
      const interactions = e.engagement?.interactionCount ?? null;

      
      // Player metrics

      const dropped = e.player?.droppedFrames ?? null;
      const decoded = e.player?.decodedFrames ?? null;
      const fps = e.player?.fps ?? null;
      const bufferLength = e.player?.bufferLengthSec ?? null;

     
      // INSERT 

      await pool.query(
        `
        INSERT INTO telemetry_events (
          event_id,
          viewer_id,
          session_id,
          event_type,
          event_timestamp,
          playback_position_sec,

          bitrate_kbps,
          resolution,
          video_width,
          video_height,

          buffer_start,
          buffer_end,
          buffer_duration_ms,

          network_downlink_mbps,
          network_rtt_ms,
          network_effective_type,

          device_browser,
          device_os,
          screen_width,
          screen_height,

          total_watch_time_ms,
          total_pause_time_ms,
          interaction_count,

          dropped_frames,
          decoded_frames,
          fps,
          buffer_length_sec,

          raw_json
        )
        VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10,
          $11, $12, $13,
          $14, $15, $16,
          $17, $18, $19, $20,
          $21, $22, $23,
          $24, $25, $26, $27,
          $28
        )
        `,
        [
          eventId,
          viewerId,
          sessionId,
          eventType,
          eventTimestamp,
          playbackPosition,

          bitrate,
          resolution,
          videoWidth,
          videoHeight,

          bufferStart,
          bufferEnd,
          bufferDuration,

          netDown,
          netRtt,
          netType,

          browser,
          os,
          screenW,
          screenH,

          watchTime,
          pauseTime,
          interactions,

          dropped,
          decoded,
          fps,
          bufferLength,

          e
        ]
      );
    }

    res.json({ ok: true });
    console.log(" event  moved to Postgress ");

  } catch (err) {
    console.error(" TELEMETRY INSERT FAILED:", err);
    res.status(500).json({ error: "insert_failed" });
  }
});

app.listen(3000, () => {
  console.log(" Telemetry backend running on http://localhost:3000");
});
