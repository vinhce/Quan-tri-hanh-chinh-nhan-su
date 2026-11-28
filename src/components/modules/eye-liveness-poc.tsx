'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type {
  Config,
  FaceResult,
  GestureResult,
  Human,
  Point,
  Result,
} from '@vladmandic/human';
import {
  AlertTriangle,
  Camera,
  CameraOff,
  CheckCircle2,
  Eye,
  Loader2,
  RefreshCw,
  ScanFace,
  ShieldCheck,
  UserCheck,
  XCircle,
} from 'lucide-react';

type PocStatus = 'idle' | 'loading' | 'error' | 'running';

interface IrisPointSummary {
  leftCenter: [number, number] | null;
  rightCenter: [number, number] | null;
  interIrisPx: number | null;
  faceDistanceM: number | null;
}

interface LiveMetrics {
  hasFace: boolean;
  liveness: number | null;
  antispoof: number | null;
  gazeLabel: string;
  blinkActive: boolean;
  iris: IrisPointSummary;
  embeddingReady: boolean;
}

interface VerifyCheckItem {
  label: string;
  passed: boolean;
  detail: string;
}

interface VerifyOutcome {
  passed: boolean;
  similarity: number | null;
  timestamp: string;
  checks: VerifyCheckItem[];
}

const HUMAN_CONFIG: Partial<Config> = {
  backend: 'webgl',
  modelBasePath: '/models/human/',
  async: true,
  cacheSensitivity: 0.75,
  face: {
    enabled: true,
    detector: { maxDetected: 1 },
    mesh: { enabled: true },
    attention: { enabled: false },
    iris: { enabled: true },
    emotion: { enabled: false },
    description: { enabled: true },
    liveness: { enabled: true },
    antispoof: { enabled: true },
  },
  body: { enabled: false },
  hand: { enabled: false },
  object: { enabled: false },
  gesture: { enabled: true },
};

const THRESHOLD_LIVENESS = 0.5;
const THRESHOLD_ANTISPOOF = 0.5;
const THRESHOLD_BLINKS = 1;
const THRESHOLD_SIMILARITY = 0.65;

const INITIAL_METRICS: LiveMetrics = {
  hasFace: false,
  liveness: null,
  antispoof: null,
  gazeLabel: 'Chưa xác định',
  blinkActive: false,
  iris: {
    leftCenter: null,
    rightCenter: null,
    interIrisPx: null,
    faceDistanceM: null,
  },
  embeddingReady: false,
};

function computeAveragePoint(points?: Point[]): [number, number] | null {
  if (!points || points.length === 0) return null;
  let sumX = 0;
  let sumY = 0;
  for (const pt of points) {
    sumX += pt[0];
    sumY += pt[1];
  }
  return [Math.round(sumX / points.length), Math.round(sumY / points.length)];
}

function computeEyeOpenRatio(face: FaceResult): number | null {
  const leftUpper = face.annotations?.leftEyeUpper0;
  const leftLower = face.annotations?.leftEyeLower0;
  const rightUpper = face.annotations?.rightEyeUpper0;
  const rightLower = face.annotations?.rightEyeLower0;

  const measureEye = (upper?: Point[], lower?: Point[]): number | null => {
    if (!upper?.length || !lower?.length) return null;
    const uMid = upper[Math.floor(upper.length / 2)];
    const lMid = lower[Math.floor(lower.length / 2)];
    const width = Math.hypot(
      upper[upper.length - 1][0] - upper[0][0],
      upper[upper.length - 1][1] - upper[0][1]
    );
    if (width <= 1) return null;
    const height = Math.hypot(uMid[0] - lMid[0], uMid[1] - lMid[1]);
    return height / width;
  };

  const leftRatio = measureEye(leftUpper, leftLower);
  const rightRatio = measureEye(rightUpper, rightLower);
  if (leftRatio !== null && rightRatio !== null) {
    return (leftRatio + rightRatio) / 2;
  }
  return leftRatio ?? rightRatio;
}

function formatGazeLabel(gestures: GestureResult[], face?: FaceResult): string {
  const irisGesture = gestures.find((g): g is { iris: number; gesture: never } => 'iris' in g);
  if (irisGesture) {
    const raw = String(irisGesture.gesture);
    if (raw.includes('left')) return 'Nhìn trái';
    if (raw.includes('right')) return 'Nhìn phải';
    if (raw.includes('up')) return 'Nhìn lên';
    if (raw.includes('down')) return 'Nhìn xuống';
    if (raw.includes('center')) return 'Nhìn thẳng';
    return raw;
  }
  const facingGesture = gestures.find(
    (g) => 'face' in g && String(g.gesture).startsWith('facing')
  );
  if (facingGesture) {
    const raw = String(facingGesture.gesture);
    if (raw.includes('left')) return 'Hướng trái';
    if (raw.includes('right')) return 'Hướng phải';
    if (raw.includes('center')) return 'Hướng thẳng';
  }
  if (face?.rotation?.gaze) {
    return `Góc ${Math.round((face.rotation.gaze.bearing * 180) / Math.PI)}°`;
  }
  return 'Đang theo dõi';
}

function mapMediaError(err: unknown): string {
  if (err instanceof DOMException) {
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      return 'Quyền truy cập camera bị từ chối. Vui lòng cấp quyền camera trên trình duyệt và thử lại.';
    }
    if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      return 'Không tìm thấy thiết bị webcam khả dụng trên máy của bạn.';
    }
    if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
      return 'Camera đang được ứng dụng khác sử dụng hoặc không thể đọc luồng video.';
    }
    if (err.name === 'OverconstrainedError') {
      return 'Camera không hỗ trợ cấu hình độ phân giải yêu cầu.';
    }
  }
  if (err instanceof Error) {
    return err.message;
  }
  return 'Đã xảy ra lỗi không xác định khi khởi động camera hoặc nạp model WebGL.';
}

function drawOverlay(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  result: Result
): void {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) return;

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, width, height);

  const face = result.face?.[0];
  if (!face) return;

  const [bx, by, bw, bh] = face.box;
  if (bw <= 0 || bh <= 0) return;

  ctx.save();

  // Khung 4 góc bo tinh tế quanh khuôn mặt (không vẽ che vùng mắt/mặt)
  const minSide = Math.min(bw, bh);
  const cornerLen = Math.min(minSide / 2, Math.max(14, Math.min(34, Math.round(minSide * 0.18))));
  const cornerRadius = Math.min(
    cornerLen,
    Math.max(6, Math.min(14, Math.round(cornerLen * 0.42)))
  );

  ctx.beginPath();
  // Góc trên-trái
  ctx.moveTo(bx, by + cornerLen);
  ctx.lineTo(bx, by + cornerRadius);
  ctx.arcTo(bx, by, bx + cornerRadius, by, cornerRadius);
  ctx.lineTo(bx + cornerLen, by);
  // Góc trên-phải
  ctx.moveTo(bx + bw - cornerLen, by);
  ctx.lineTo(bx + bw - cornerRadius, by);
  ctx.arcTo(bx + bw, by, bx + bw, by + cornerRadius, cornerRadius);
  ctx.lineTo(bx + bw, by + cornerLen);
  // Góc dưới-phải
  ctx.moveTo(bx + bw, by + bh - cornerLen);
  ctx.lineTo(bx + bw, by + bh - cornerRadius);
  ctx.arcTo(bx + bw, by + bh, bx + bw - cornerRadius, by + bh, cornerRadius);
  ctx.lineTo(bx + bw - cornerLen, by + bh);
  // Góc dưới-trái
  ctx.moveTo(bx + cornerLen, by + bh);
  ctx.lineTo(bx + cornerRadius, by + bh);
  ctx.arcTo(bx, by + bh, bx, by + bh - cornerRadius, cornerRadius);
  ctx.lineTo(bx, by + bh - cornerLen);

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(15, 118, 110, 0.45)';
  ctx.lineWidth = 5;
  ctx.stroke();

  ctx.strokeStyle = '#14B8A6';
  ctx.lineWidth = 2.75;
  ctx.stroke();

  // Nhãn trạng thái gọn gàng ở mép trên khung mặt
  const livePct = typeof face.live === 'number' ? Math.round(face.live * 100) : 0;
  const realPct = typeof face.real === 'number' ? Math.round(face.real * 100) : 0;
  const label = `Live ${livePct}% · Real ${realPct}%`;

  ctx.font = '600 12.5px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  const padX = 10;
  const badgeHeight = 24;
  const badgeRadius = 8;
  const textWidth = ctx.measureText(label).width;
  const badgeWidth = Math.ceil(textWidth + padX * 2);
  const badgeX = Math.max(8, Math.min(width - badgeWidth - 8, bx + (bw - badgeWidth) / 2));
  const badgeY = Math.max(8, by - badgeHeight - 8);

  ctx.beginPath();
  ctx.moveTo(badgeX + badgeRadius, badgeY);
  ctx.lineTo(badgeX + badgeWidth - badgeRadius, badgeY);
  ctx.arcTo(badgeX + badgeWidth, badgeY, badgeX + badgeWidth, badgeY + badgeRadius, badgeRadius);
  ctx.lineTo(badgeX + badgeWidth, badgeY + badgeHeight - badgeRadius);
  ctx.arcTo(
    badgeX + badgeWidth,
    badgeY + badgeHeight,
    badgeX + badgeWidth - badgeRadius,
    badgeY + badgeHeight,
    badgeRadius
  );
  ctx.lineTo(badgeX + badgeRadius, badgeY + badgeHeight);
  ctx.arcTo(badgeX, badgeY + badgeHeight, badgeX, badgeY + badgeHeight - badgeRadius, badgeRadius);
  ctx.lineTo(badgeX, badgeY + badgeRadius);
  ctx.arcTo(badgeX, badgeY, badgeX + badgeRadius, badgeY, badgeRadius);
  ctx.closePath();

  ctx.fillStyle = 'rgba(15, 118, 110, 0.9)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(20, 184, 166, 0.8)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, badgeX + padX, badgeY + badgeHeight / 2 + 0.5);

  ctx.restore();
}

export function EyeLivenessPoc() {
  const [status, setStatus] = useState<PocStatus>('idle');
  const [loadingStep, setLoadingStep] = useState<string>('Đang khởi tạo...');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [metrics, setMetrics] = useState<LiveMetrics>(INITIAL_METRICS);
  const [blinkCount, setBlinkCount] = useState<number>(0);
  const [enrolledEmbedding, setEnrolledEmbedding] = useState<number[] | null>(null);
  const [enrolledAt, setEnrolledAt] = useState<string | null>(null);
  const [verifyOutcome, setVerifyOutcome] = useState<VerifyOutcome | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const humanRef = useRef<Human | null>(null);
  const rafRef = useRef<number | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const isBlinkingRef = useRef<boolean>(false);
  const latestFaceRef = useRef<FaceResult | null>(null);
  const blinkCountRef = useRef<number>(0);

  const stopCameraAndLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
    latestFaceRef.current = null;
    isBlinkingRef.current = false;
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      stopCameraAndLoop();
    };
  }, [stopCameraAndLoop]);

  const startCameraAndModel = useCallback(async () => {
    stopCameraAndLoop();
    setErrorMessage('');
    setVerifyOutcome(null);
    setMetrics(INITIAL_METRICS);
    blinkCountRef.current = 0;
    setBlinkCount(0);

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      setStatus('error');
      setErrorMessage(
        'Trình duyệt không hỗ trợ WebRTC camera (navigator.mediaDevices.getUserMedia).'
      );
      return;
    }

    setStatus('loading');

    try {
      setLoadingStep('Đang nạp thư viện @vladmandic/human...');
      const { Human } = await import('@vladmandic/human');

      if (!humanRef.current) {
        setLoadingStep('Đang tải model cục bộ (Face Mesh, Iris, Liveness, Anti-spoof)...');
        const instance = new Human(HUMAN_CONFIG);
        await instance.load();
        humanRef.current = instance;
      }

      if (!isMountedRef.current) return;

      setLoadingStep('Đang xin quyền truy cập camera...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });

      if (!isMountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;
      setStatus('running');
    } catch (err) {
      stopCameraAndLoop();
      if (!isMountedRef.current) return;
      setStatus('error');
      setErrorMessage(mapMediaError(err));
    }
  }, [stopCameraAndLoop]);

  const handleStopCamera = useCallback(() => {
    stopCameraAndLoop();
    setMetrics(INITIAL_METRICS);
    setStatus('idle');
  }, [stopCameraAndLoop]);

  // Vòng lặp nhận diện khi camera đã sẵn sàng
  useEffect(() => {
    if (status !== 'running') return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const stream = streamRef.current;
    const human = humanRef.current;
    if (!video || !canvas || !stream || !human) return;

    let cancelled = false;
    video.srcObject = stream;

    const runLoop = async () => {
      try {
        await video.play();
      } catch {
        // Bỏ qua lỗi play nếu unmount nhanh
        return;
      }

      const detectFrame = async () => {
        if (cancelled || !isMountedRef.current) return;

        if (video.readyState >= 2 && !video.paused && !video.ended) {
          try {
            const result = await human.detect(video);
            if (cancelled || !isMountedRef.current) return;

            drawOverlay(canvas, video, result);

            const face = result.face?.[0] ?? null;
            latestFaceRef.current = face;

            if (face) {
              const gestureBlink = result.gesture.some(
                (g) => 'face' in g && String(g.gesture).startsWith('blink')
              );
              const ear = computeEyeOpenRatio(face);
              const meshBlink = ear !== null && ear < 0.22;
              const currentlyBlinking = gestureBlink || meshBlink;

              if (currentlyBlinking && !isBlinkingRef.current) {
                isBlinkingRef.current = true;
                blinkCountRef.current += 1;
                setBlinkCount(blinkCountRef.current);
              } else if (!currentlyBlinking && isBlinkingRef.current) {
                isBlinkingRef.current = false;
              }

              const leftCenter = computeAveragePoint(face.annotations?.leftEyeIris);
              const rightCenter = computeAveragePoint(face.annotations?.rightEyeIris);
              const interIrisPx =
                leftCenter && rightCenter
                  ? Math.round(
                      Math.hypot(rightCenter[0] - leftCenter[0], rightCenter[1] - leftCenter[1])
                    )
                  : null;

              setMetrics({
                hasFace: true,
                liveness: typeof face.live === 'number' ? face.live : null,
                antispoof: typeof face.real === 'number' ? face.real : null,
                gazeLabel: formatGazeLabel(result.gesture, face),
                blinkActive: currentlyBlinking,
                iris: {
                  leftCenter,
                  rightCenter,
                  interIrisPx,
                  faceDistanceM: typeof face.distance === 'number' ? face.distance : null,
                },
                embeddingReady: Array.isArray(face.embedding) && face.embedding.length > 0,
              });
            } else {
              setMetrics({
                ...INITIAL_METRICS,
                gazeLabel: 'Không thấy khuôn mặt',
              });
            }
          } catch {
            // Bỏ qua lỗi frame đơn lẻ để giữ vòng lặp mượt
          }
        }

        if (!cancelled && isMountedRef.current) {
          rafRef.current = requestAnimationFrame(() => {
            void detectFrame();
          });
        }
      };

      rafRef.current = requestAnimationFrame(() => {
        void detectFrame();
      });
    };

    void runLoop();

    return () => {
      cancelled = true;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [status]);

  const handleEnrollSample = useCallback(() => {
    const face = latestFaceRef.current;
    if (!face?.embedding || face.embedding.length === 0) return;
    setEnrolledEmbedding([...face.embedding]);
    setEnrolledAt(
      new Date().toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    );
    setVerifyOutcome(null);
  }, []);

  const handleVerifySample = useCallback(() => {
    const human = humanRef.current;
    const face = latestFaceRef.current;
    const currentEmbedding = face?.embedding;
    const liveness = typeof face?.live === 'number' ? face.live : 0;
    const antispoof = typeof face?.real === 'number' ? face.real : 0;
    const blinks = blinkCountRef.current;

    let similarity: number | null = null;
    if (human && enrolledEmbedding && currentEmbedding && currentEmbedding.length > 0) {
      similarity = human.match.similarity(enrolledEmbedding, currentEmbedding);
    }

    const checks: VerifyCheckItem[] = [
      {
        label: 'Mẫu khuôn mặt đã lưu (Enroll)',
        passed: Boolean(enrolledEmbedding),
        detail: enrolledEmbedding
          ? `Đã có mẫu (${enrolledEmbedding.length} chiều)`
          : 'Chưa lưu mẫu thử',
      },
      {
        label: 'Khuôn mặt hiện tại & Embedding',
        passed: Boolean(currentEmbedding && currentEmbedding.length > 0),
        detail:
          currentEmbedding && currentEmbedding.length > 0
            ? 'Nhận diện hợp lệ'
            : 'Không phát hiện khuôn mặt hợp lệ',
      },
      {
        label: `Liveness >= ${Math.round(THRESHOLD_LIVENESS * 100)}%`,
        passed: liveness >= THRESHOLD_LIVENESS,
        detail: `Hiện tại: ${Math.round(liveness * 100)}%`,
      },
      {
        label: `Anti-spoof >= ${Math.round(THRESHOLD_ANTISPOOF * 100)}%`,
        passed: antispoof >= THRESHOLD_ANTISPOOF,
        detail: `Hiện tại: ${Math.round(antispoof * 100)}%`,
      },
      {
        label: `Chớp mắt >= ${THRESHOLD_BLINKS} lần`,
        passed: blinks >= THRESHOLD_BLINKS,
        detail: `Đã chớp: ${blinks} lần`,
      },
      {
        label: `Độ tương đồng 1:1 >= ${(THRESHOLD_SIMILARITY * 100).toFixed(0)}%`,
        passed: similarity !== null && similarity >= THRESHOLD_SIMILARITY,
        detail:
          similarity !== null ? `Độ khớp: ${(similarity * 100).toFixed(1)}%` : 'Chưa thể so khớp',
      },
    ];

    const passed = checks.every((c) => c.passed);
    setVerifyOutcome({
      passed,
      similarity,
      timestamp: new Date().toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
      checks,
    });
  }, [enrolledEmbedding]);

  const livenessPct = metrics.liveness !== null ? Math.round(metrics.liveness * 100) : null;
  const antispoofPct = metrics.antispoof !== null ? Math.round(metrics.antispoof * 100) : null;

  return (
    <div className="space-y-5">
      {/* Header & nút điều khiển chính */}
      <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#0F766E]/10 text-[#0F766E] dark:bg-teal-500/15 dark:text-teal-300">
              <Eye className="h-4 w-4" />
            </span>
            <h1 className="truncate text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 sm:text-xl">
              POC Mống mắt &amp; Liveness (@vladmandic/human)
            </h1>
          </div>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Kiểm thử WebGL face mesh, mống mắt, chống giả mạo và đối chiếu 1:1 cục bộ trên trình
            duyệt.
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {status === 'running' ? (
            <button
              type="button"
              onClick={handleStopCamera}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-300 dark:hover:bg-rose-900/60"
            >
              <CameraOff className="h-4 w-4" />
              Tắt Camera
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void startCameraAndModel()}
              disabled={status === 'loading'}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#0F766E] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-[#0D655E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {status === 'loading' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Camera className="h-4 w-4" />
              )}
              {status === 'loading' ? 'Đang nạp...' : 'Bật Camera & Nạp Model'}
            </button>
          )}
        </div>
      </div>

      {/* Khối chính: Camera Viewport + Chỉ số & Thử nghiệm 1:1 */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Cột trái: Camera & 4 trạng thái */}
        <div className="lg:col-span-7">
          <div className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-950 shadow-sm dark:border-zinc-800">
            <div className="relative aspect-[4/3] w-full">
              {/* Video + Canvas overlay luôn sẵn sàng khi running */}
              <video
                ref={videoRef}
                muted
                playsInline
                className={`h-full w-full object-cover ${
                  status === 'running' ? 'block' : 'hidden'
                }`}
              />
              <canvas
                ref={canvasRef}
                className={`pointer-events-none absolute inset-0 h-full w-full object-cover ${
                  status === 'running' ? 'block' : 'hidden'
                }`}
              />

              {/* Trạng thái 1: Chờ bật camera */}
              {status === 'idle' && (
                <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-zinc-200">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0F766E]/20 text-teal-300">
                    <ScanFace className="h-7 w-7" />
                  </div>
                  <div className="max-w-sm space-y-1">
                    <p className="text-base font-medium text-white">Camera đang tắt</p>
                    <p className="text-xs text-zinc-400 sm:text-sm">
                      Nhấn <strong className="text-teal-300">Bật Camera &amp; Nạp Model</strong> để
                      tải WebGL model và bắt đầu theo dõi mống mắt.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void startCameraAndModel()}
                    className="mt-1 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#0F766E] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#0D655E]"
                  >
                    <Camera className="h-4 w-4" />
                    Bật Camera &amp; Nạp Model
                  </button>
                </div>
              )}

              {/* Trạng thái 2: Đang tải model / xin quyền */}
              {status === 'loading' && (
                <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-zinc-200">
                  <Loader2 className="h-10 w-10 animate-spin text-teal-400" />
                  <p className="text-sm font-medium text-white">Đang chuẩn bị hệ thống...</p>
                  <p className="max-w-sm text-xs text-zinc-400">{loadingStep}</p>
                </div>
              )}

              {/* Trạng thái 3: Lỗi */}
              {status === 'error' && (
                <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-zinc-200">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/20 text-rose-400">
                    <AlertTriangle className="h-6 w-6" />
                  </div>
                  <div className="max-w-md space-y-1">
                    <p className="text-sm font-semibold text-rose-300">
                      Không thể khởi chạy Camera / Model
                    </p>
                    <p className="text-xs text-zinc-300 sm:text-sm">{errorMessage}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void startCameraAndModel()}
                    className="mt-1 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#0F766E] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#0D655E]"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Thử lại
                  </button>
                </div>
              )}

              {/* Badge trạng thái góc trên khi đang chạy */}
              {status === 'running' && (
                <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 rounded-full bg-zinc-950/75 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      metrics.hasFace ? 'bg-emerald-400' : 'bg-amber-400'
                    }`}
                  />
                  {metrics.hasFace ? 'Đã khóa khuôn mặt' : 'Đang tìm khuôn mặt...'}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Cột phải: Chỉ số trực tiếp & Thử nghiệm 1:1 */}
        <div className="space-y-4 lg:col-span-5">
          {/* Card chỉ số Real-time */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              <ShieldCheck className="h-4 w-4 text-[#0F766E] dark:text-teal-400" />
              Chỉ số Sinh trắc &amp; Mống mắt (Real-time)
            </h2>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950/60">
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Liveness</p>
                <p className="mt-1 font-mono text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                  {livenessPct !== null ? `${livenessPct}%` : '--'}
                </p>
                <p className="mt-0.5 text-[11px] text-zinc-500">Ngưỡng: &ge; 50%</p>
              </div>

              <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950/60">
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Anti-spoof</p>
                <p className="mt-1 font-mono text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                  {antispoofPct !== null ? `${antispoofPct}%` : '--'}
                </p>
                <p className="mt-0.5 text-[11px] text-zinc-500">Ngưỡng: &ge; 50%</p>
              </div>

              <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950/60">
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Số lần chớp mắt</p>
                <p className="mt-1 font-mono text-xl font-semibold text-[#0F766E] dark:text-teal-400">
                  {blinkCount}
                </p>
                <p className="mt-0.5 text-[11px] text-zinc-500">
                  {metrics.blinkActive ? 'Đang chớp mắt' : 'Mắt mở'}
                </p>
              </div>

              <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950/60">
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Hướng nhìn</p>
                <p className="mt-1 truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {metrics.gazeLabel}
                </p>
                <p className="mt-0.5 text-[11px] text-zinc-500">Gesture / Iris</p>
              </div>
            </div>

            {/* Tọa độ / Khoảng cách mống mắt */}
            <div className="mt-3 rounded-xl border border-zinc-100 bg-zinc-50 p-3 text-xs dark:border-zinc-800 dark:bg-zinc-950/60">
              <p className="font-medium text-zinc-700 dark:text-zinc-300">
                Tọa độ &amp; Khoảng cách mống mắt
              </p>
              <div className="mt-1.5 grid grid-cols-1 gap-1 font-mono text-[11px] text-zinc-600 dark:text-zinc-400 sm:grid-cols-2">
                <span>
                  Mắt trái:{' '}
                  {metrics.iris.leftCenter
                    ? `(${metrics.iris.leftCenter[0]}, ${metrics.iris.leftCenter[1]})`
                    : '--'}
                </span>
                <span>
                  Mắt phải:{' '}
                  {metrics.iris.rightCenter
                    ? `(${metrics.iris.rightCenter[0]}, ${metrics.iris.rightCenter[1]})`
                    : '--'}
                </span>
                <span>
                  Khoảng cách 2 mống mắt:{' '}
                  {metrics.iris.interIrisPx !== null ? `${metrics.iris.interIrisPx} px` : '--'}
                </span>
                <span>
                  Khoảng cách mặt:{' '}
                  {metrics.iris.faceDistanceM !== null
                    ? `${metrics.iris.faceDistanceM.toFixed(2)} m`
                    : '--'}
                </span>
              </div>
            </div>
          </div>

          {/* Card thử nghiệm 1:1 cục bộ */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              <UserCheck className="h-4 w-4 text-[#0F766E] dark:text-teal-400" />
              Kiểm thử 1:1 (Trạng thái cục bộ)
            </h2>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {enrolledEmbedding
                ? `Đã lưu mẫu thử lúc ${enrolledAt} (${enrolledEmbedding.length} chiều).`
                : 'Chưa có mẫu thử. Nhìn thẳng vào camera và bấm Lưu mẫu thử.'}
            </p>

            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={handleEnrollSample}
                disabled={status !== 'running' || !metrics.embeddingReady}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[#0F766E] bg-white px-3 py-2 text-sm font-medium text-[#0F766E] transition hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-teal-500 dark:bg-zinc-900 dark:text-teal-300 dark:hover:bg-teal-950/40"
              >
                <ScanFace className="h-4 w-4" />
                Lưu mẫu thử (Enroll)
              </button>

              <button
                type="button"
                onClick={handleVerifySample}
                disabled={status !== 'running' || !enrolledEmbedding}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#0F766E] px-3 py-2 text-sm font-medium text-white transition hover:bg-[#0D655E] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ShieldCheck className="h-4 w-4" />
                Chấm công thử (Verify 1:1)
              </button>
            </div>

            {verifyOutcome && (
              <div
                className={`mt-3 rounded-xl border p-3 text-xs ${
                  verifyOutcome.passed
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200'
                    : 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200'
                }`}
              >
                <div className="flex items-center justify-between gap-2 font-semibold">
                  <span className="flex items-center gap-1.5 text-sm">
                    {verifyOutcome.passed ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        Kết quả: ĐẠT
                      </>
                    ) : (
                      <>
                        <XCircle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                        Kết quả: TỪ CHỐI
                      </>
                    )}
                  </span>
                  <span className="font-mono text-[11px] opacity-80">{verifyOutcome.timestamp}</span>
                </div>

                <ul className="mt-2 space-y-1">
                  {verifyOutcome.checks.map((item) => (
                    <li key={item.label} className="flex items-start justify-between gap-2">
                      <span className="flex items-center gap-1.5">
                        {item.passed ? (
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600 dark:text-rose-400" />
                        )}
                        <span>{item.label}</span>
                      </span>
                      <span className="shrink-0 font-mono text-[11px] opacity-90">
                        {item.detail}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
