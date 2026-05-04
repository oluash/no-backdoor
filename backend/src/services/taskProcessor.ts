/**
 * Task Processor — Background Verification Task Processor
 *
 * Simulates a multi-stage verification pipeline with real-time progress
 * tracking via WebSocket events. Polls Redis for pending tasks and
 * processes them through 5 stages: upload validation, static analysis,
 * dynamic analysis, manual review, and final verification.
 */

import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import { EventEmitter } from 'events';
import { QueueService } from './queueService';
import type { QueueTask } from '../../api/types';

// ---------------------------------------------------------------------------
// Processing stage definitions
// ---------------------------------------------------------------------------

interface ProcessingStage {
  name: string;
  description: string;
  minProgressDelta: number;
  maxProgressDelta: number;
  sleepMsMin: number;
  sleepMsMax: number;
}

const PROCESSING_STAGES: ProcessingStage[] = [
  {
    name: 'upload_validation',
    description: 'Upload validation',
    minProgressDelta: 10,
    maxProgressDelta: 25,
    sleepMsMin: 1000,
    sleepMsMax: 2000,
  },
  {
    name: 'static_analysis',
    description: 'Static analysis',
    minProgressDelta: 10,
    maxProgressDelta: 30,
    sleepMsMin: 1000,
    sleepMsMax: 2000,
  },
  {
    name: 'dynamic_analysis',
    description: 'Dynamic analysis',
    minProgressDelta: 10,
    maxProgressDelta: 25,
    sleepMsMin: 1000,
    sleepMsMax: 2000,
  },
  {
    name: 'manual_review',
    description: 'Manual review',
    minProgressDelta: 10,
    maxProgressDelta: 20,
    sleepMsMin: 1000,
    sleepMsMax: 2000,
  },
  {
    name: 'final_verification',
    description: 'Final verification',
    minProgressDelta: 5,
    maxProgressDelta: 15,
    sleepMsMin: 1000,
    sleepMsMax: 1500,
  },
];

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

function randomBetween(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Simulated failure rate (5% chance a task fails at any stage)
const FAILURE_RATE = 0.05;

// ---------------------------------------------------------------------------
// Task Processor
// ---------------------------------------------------------------------------

export class TaskProcessor {
  private pool: Pool;
  private redis: Redis;
  private wsEmitter: EventEmitter;
  private queueService: QueueService;
  private maxConcurrency: number;
  private pollIntervalMs: number;
  private isRunning = false;
  private activeTasks = new Set<string>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private shutdownResolve: (() => void) | null = null;

  constructor(
    pool: Pool,
    redis: Redis,
    wsEmitter: EventEmitter,
    options: { maxConcurrency?: number; pollIntervalMs?: number } = {}
  ) {
    this.pool = pool;
    this.redis = redis;
    this.wsEmitter = wsEmitter;
    this.queueService = new QueueService(pool, redis, wsEmitter);
    this.maxConcurrency = options.maxConcurrency ?? 3;
    this.pollIntervalMs = options.pollIntervalMs ?? 5000;
  }

  // ── Process a single task ───────────────────────────────────────────────

  async processTask(internalId: string, taskId: string): Promise<void> {
    if (this.activeTasks.has(internalId)) {
      return; // Already processing
    }

    this.activeTasks.add(internalId);

    try {
      // Mark as processing in DB
      await this.pool.query(
        `UPDATE verification_tasks
         SET status = 'processing', started_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [internalId]
      );

      // Get fresh task data
      const task = await this.queueService.getTaskByInternalId(internalId);
      if (!task) {
        throw new Error(`Task ${taskId} not found during processing`);
      }

      // Emit started event
      this.wsEmitter.emit('task:started', { taskId, task });

      // Insert started log
      await this.queueService.insertTaskLog(
        internalId,
        'info',
        `Task ${taskId} processing started`,
        { checkTypes: task.checkTypes, systemId: task.systemId }
      );

      let currentProgress = 0;

      // Process each stage
      for (let i = 0; i < PROCESSING_STAGES.length; i++) {
        const stage = PROCESSING_STAGES[i];

        // Simulate random failure
        if (Math.random() < FAILURE_RATE) {
          await this.handleFailure(
            internalId,
            taskId,
            `Simulated failure during ${stage.description}`
          );
          return;
        }

        // Insert stage-start log
        await this.queueService.insertTaskLog(
          internalId,
          'info',
          `Starting ${stage.description} (stage ${i + 1}/${PROCESSING_STAGES.length})`,
          { stage: stage.name, step: i + 1, totalSteps: PROCESSING_STAGES.length }
        );

        // Simulate work
        const sleepMs = randomBetween(stage.sleepMsMin, stage.sleepMsMax);
        await sleep(sleepMs);

        // Calculate progress increment
        const delta = randomBetween(
          stage.minProgressDelta,
          stage.maxProgressDelta
        );
        currentProgress = Math.min(95, currentProgress + delta);

        // Update progress in DB
        await this.queueService.updateTaskProgress(
          internalId,
          currentProgress
        );

        // Emit progress event
        this.wsEmitter.emit('task:progress', {
          taskId,
          progress: currentProgress,
          stage: stage.name,
          stageName: stage.description,
          step: i + 1,
          totalSteps: PROCESSING_STAGES.length,
        });

        // Insert progress log
        await this.queueService.insertTaskLog(
          internalId,
          'info',
          `${stage.description} complete — ${currentProgress}%`,
          { stage: stage.name, progress: currentProgress }
        );
      }

      // All stages complete — mark as completed
      await this.handleSuccess(internalId, taskId, task);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unknown processing error';
      await this.handleFailure(internalId, taskId, message);
    } finally {
      this.activeTasks.delete(internalId);
    }
  }

  // ── Handle successful completion ────────────────────────────────────────

  private async handleSuccess(
    internalId: string,
    taskId: string,
    task: QueueTask
  ): Promise<void> {
    // Calculate a mock verification score (80-100)
    const verificationScore = randomBetween(80, 101);

    // Update task as completed
    await this.pool.query(
      `UPDATE verification_tasks
       SET status = 'completed',
           progress = 100,
           completed_at = NOW(),
           updated_at = NOW(),
           result_summary = COALESCE(result_summary, $2)
       WHERE id = $1`,
      [internalId, `Verification complete — Score: ${verificationScore}/100`]
    );

    // Insert success log
    await this.queueService.insertTaskLog(
      internalId,
      'success',
      `Task ${taskId} completed successfully. Verification score: ${verificationScore}/100`,
      { verificationScore, completedAt: new Date().toISOString() }
    );

    // Update system verification_score
    await this.pool.query(
      `UPDATE systems
       SET verification_score = $1,
           updated_at = NOW()
       WHERE id = $2`,
      [verificationScore, task.systemId]
    );

    // Emit completed event
    this.wsEmitter.emit('task:completed', {
      taskId,
      progress: 100,
      verificationScore,
    });
  }

  // ── Handle failure ──────────────────────────────────────────────────────

  private async handleFailure(
    internalId: string,
    taskId: string,
    errorMessage: string
  ): Promise<void> {
    // Update task as failed
    await this.pool.query(
      `UPDATE verification_tasks
       SET status = 'failed',
           error_message = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [internalId, errorMessage]
    );

    // Insert error log
    await this.queueService.insertTaskLog(
      internalId,
      'error',
      `Task ${taskId} failed: ${errorMessage}`,
      { error: errorMessage, failedAt: new Date().toISOString() }
    );

    // Emit failed event
    this.wsEmitter.emit('task:failed', {
      taskId,
      error: errorMessage,
    });
  }

  // ── Poll for pending tasks ──────────────────────────────────────────────

  private async pollQueue(): Promise<void> {
    if (this.activeTasks.size >= this.maxConcurrency) {
      return; // At capacity
    }

    try {
      // Try to claim a task from Redis queue
      const slotCount = this.maxConcurrency - this.activeTasks.size;

      for (let i = 0; i < slotCount; i++) {
        const item = await this.redis.rpop('verification:queue');
        if (!item) break;

        let parsed: { taskId: string; id: string; priority?: string };
        try {
          parsed = JSON.parse(item);
        } catch {
          // Not JSON, treat as raw taskId
          // Look up internal ID
          const lookup = await this.pool.query<{ id: string }>(
            'SELECT id FROM verification_tasks WHERE task_id = $1 AND status = $2',
            [item, 'pending']
          );
          if (lookup.rowCount === 0) continue;
          parsed = { taskId: item, id: lookup.rows[0].id };
        }

        // Verify task is still pending
        const statusCheck = await this.pool.query<{ status: string }>(
          'SELECT status FROM verification_tasks WHERE id = $1',
          [parsed.id]
        );

        if (
          statusCheck.rowCount === 0 ||
          statusCheck.rows[0].status !== 'pending'
        ) {
          continue; // Task no longer pending, skip
        }

        // Process task (don't await — fire and forget)
        this.processTask(parsed.id, parsed.taskId).catch((err) => {
          console.error(`[TaskProcessor] Error processing task ${parsed.taskId}:`, err);
        });
      }
    } catch (err) {
      console.error('[TaskProcessor] Poll error:', err);
    }
  }

  // ── Start the processor ─────────────────────────────────────────────────

  start(): void {
    if (this.isRunning) {
      console.warn('[TaskProcessor] Already running');
      return;
    }

    this.isRunning = true;
    console.log(
      `[TaskProcessor] Started (concurrency=${this.maxConcurrency}, pollInterval=${this.pollIntervalMs}ms)`
    );

    // Immediate first poll
    this.pollQueue();

    // Set up polling interval
    this.pollTimer = setInterval(() => {
      this.pollQueue();
    }, this.pollIntervalMs);
  }

  // ── Stop the processor (graceful shutdown) ──────────────────────────────

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    console.log('[TaskProcessor] Stopping...');
    this.isRunning = false;

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    // Wait for active tasks to complete
    if (this.activeTasks.size > 0) {
      console.log(
        `[TaskProcessor] Waiting for ${this.activeTasks.size} active task(s) to complete...`
      );

      await new Promise<void>((resolve) => {
        this.shutdownResolve = resolve;
        const checkInterval = setInterval(() => {
          if (this.activeTasks.size === 0) {
            clearInterval(checkInterval);
            this.shutdownResolve?.();
          }
        }, 500);

        // Timeout after 60 seconds
        setTimeout(() => {
          clearInterval(checkInterval);
          console.warn(
            '[TaskProcessor] Shutdown timeout reached, forcing stop'
          );
          resolve();
        }, 60000);
      });
    }

    console.log('[TaskProcessor] Stopped');
  }

  // ── Status ──────────────────────────────────────────────────────────────

  getStatus(): {
    isRunning: boolean;
    activeCount: number;
    maxConcurrency: number;
  } {
    return {
      isRunning: this.isRunning,
      activeCount: this.activeTasks.size,
      maxConcurrency: this.maxConcurrency,
    };
  }
}
