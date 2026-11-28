'use client';

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import type {
  Config,
  FaceResult,
  GestureResult,
  Human,
  Result,
} from '@vladmandic/human';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Eye,
  Loader2,
  RefreshCw,
  ScanFace,
  ShieldCheck,
  Trash2,
  Wifi,
  WifiOff,
  X,
  XCircle,
} from 'lucide-react';
import {
  FaceBiometricFlowError,
  type FaceCoverStatus,
  checkFaceMaskStatus,
  deleteFaceBiometricProfile,
  fetchFaceBiometricProfiles,
  fetchPeriocularEngineStatus,
  registerFaceBiometricProfile,
  verifyFaceBiometricPunch,
} from '@/lib/biometric-attendance';
import type {
  Employee,
  FaceBiometricProfileDto,
  RoleCode,
  WifiVerificationResult,
} from '@/mock/types';

export type FaceLivenessModalMode = 'enroll' | 'punch';
export type FacePunchKind = 'CHECK_IN' | 'CHECK_OUT';

export interface FaceEnrolledMeta {
  profile: FaceBiometricProfileDto;
  wifi: WifiVerificationResult;
}

export interface FacePunchVerifiedPayload {
  similarity: number;
  liveness: number;
  antispoof: number;
  blinkCount: number;
  wifi: WifiVerificationResult;
  deviceLabel: string;
  profile?: FaceBiometricProfileDto;
  verifiedAt?: string;
}

export interface FacePunchRecordResult {
  action: FacePunchKind;
  checkIn?: string | null;
  checkOut?: string | null;
  shiftCode?: string;
  workdayValue?: number;
}

export interface FaceLivenessAttendanceModalProps {
  open: boolean;
  mode: FaceLivenessModalMode;
  punchKind?: FacePunchKind;
  employee: Employee;
  role: RoleCode;
  wifiStatus: WifiVerificationResult | null;
  existingProfile: FaceBiometricProfileDto | null;
  punchActionLabel?: string;
  onEnrolled: (profiles: FaceBiometricProfileDto[], meta?: FaceEnrolledMeta) => void;
  onPunchVerified: (
    res: FacePunchVerifiedPayload
  ) => Promise<FacePunchRecordResult | void> | FacePunchRecordResult | void;
  onDeleted?: (profiles: FaceBiometricProfileDto[]) => void;
  onClose: () => void;
}

type ModalPhase = 'loading' | 'error' | 'scanning' | 'submitting' | 'success';
type ScanModality = 'full_face' | 'periocular';

interface LiveMetrics {
  hasFace: boolean;
  liveness: number | null;
  antispoof: number | null;
  gazeLabel: string;
  blinkActive: boolean;
  embeddingReady: boolean;
}

interface QualifiedFaceSnapshot {
  embedding: number[];
  liveness: number;
  antispoof: number;
  qualityScore: number;
  bestFrameB64?: string | null;
  capturedAt: number;
}

interface QualifiedPeriocularSnapshot {
  liveness: number;
  antispoof: number;
  capturedAt: number;
}

interface BufferedFrame {
  dataUrl: string;
  capturedAt: number;
  eyeOpennessScore?: number;
}

type FaceCoverState = 'none' | 'mask' | 'full_cover';

interface PeriocularRoiState {
  canvas: HTMLCanvasElement | null;
  prevGray: Uint8Array | null;
  eyeContrastBaseline: number;
  pupilDarknessBaseline: number;
  localMotionAccumulator: number;
  inRoiBlink: boolean;
  blinkStartedAt: number;
  roiBlinkCooldownUntil: number;
  baselinePupilX: number | null;
  baselinePupilY: number | null;
}

interface PeriocularRoiAnalysis {
  meanFrameLuma: number;
  eyesPresent: boolean;
  blinkActive: boolean;
  blinkTriggered: boolean;
  eyeOpennessScore: number;
  liveness: number;
  antispoof: number;
  gazeDx: number;
  gazeDy: number;
}

interface SuccessSummary {
  kind: 'enroll' | FacePunchKind;
  deviceLabel: string;
  wifiIp: string;
  wifiSsidLabel?: string;
  embeddingDim?: number;
  similarity?: number;
  liveness: number;
  antispoof: number;
  faceCover?: FaceCoverState | null;
  checkIn?: string | null;
  checkOut?: string | null;
  shiftCode?: string;
  workdayValue?: number;
}

function isOpaqueNetworkMarker(value?: string | null): boolean {
  if (!value) return true;
  const normalized = value.trim().toLowerCase();
  return (
    !normalized ||
    normalized === 'verified-network' ||
    normalized === 'nội bộ' ||
    normalized === '--'
  );
}

function formatCleanWifiDisplay(
  wifiIp?: string | null,
  wifiSsidLabel?: string | null
): string {
  const rawSsid = (wifiSsidLabel || '').trim();
  if (isOpaqueNetworkMarker(wifiIp)) {
    if (!rawSsid || rawSsid === 'WiFi Nội bộ' || rawSsid === 'WiFi nội bộ') {
      return 'WiFi Nội bộ · Cùng mạng máy chủ';
    }
    const innerMatch = rawSsid.match(/^WiFi Nội bộ\s*\(([^()]+)\)$/i);
    if (innerMatch?.[1]) {
      return `WiFi Nội bộ · ${innerMatch[1].trim()}`;
    }
    return rawSsid.includes('WiFi Nội bộ') ? rawSsid : `WiFi Nội bộ · ${rawSsid}`;
  }
  return `WiFi Nội bộ (${wifiIp!.trim()})`;
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
const SNAPSHOT_GRACE_MS = 1800;
const AUTO_SUBMIT_STABLE_MS = 150;
const MAX_AUTO_RETRY_ATTEMPTS = 3;
const DEFAULT_DEVICE_LABEL = 'Camera Khuôn mặt';
const PERIOCULAR_GUIDE_BOX = {
  x: 0.15,
  y: 0.15,
  w: 0.7,
  h: 0.63,
} as const;
const ROI_CANVAS_WIDTH = 160;
const ROI_CANVAS_HEIGHT = 120;
const PERIOCULAR_FRAME_MAX_WIDTH = 640;
const PERIOCULAR_FRAME_QUALITY = 0.84;
const PERIOCULAR_AUX_MIN_GAP_MS = 250;
const MASK_PROBE_INTERVAL_MS = 450;
const EYE_LANDMARK_TTL_MS = 2200;

const INITIAL_METRICS: LiveMetrics = {
  hasFace: false,
  liveness: null,
  antispoof: null,
  gazeLabel: 'Đang theo dõi',
  blinkActive: false,
  embeddingReady: false,
};

let sharedHumanPromise: Promise<Human> | null = null;
let sharedHumanInstance: Human | null = null;

function getSharedHuman(onStep?: (step: string) => void): Promise<Human> {
  if (sharedHumanInstance) {
    return Promise.resolve(sharedHumanInstance);
  }
  if (sharedHumanPromise) {
    onStep?.('Đang hoàn tất tải model nhận diện khuôn mặt...');
    return sharedHumanPromise;
  }

  sharedHumanPromise = (async () => {
    onStep?.('Đang nạp thư viện sinh trắc học...');
    const { Human } = await import('@vladmandic/human');
    onStep?.('Đang tải model cục bộ (Nhận diện khuôn mặt)...');
    const instance = new Human(HUMAN_CONFIG);
    await instance.load();
    sharedHumanInstance = instance;
    return instance;
  })().catch((err) => {
    sharedHumanPromise = null;
    sharedHumanInstance = null;
    throw err;
  });

  return sharedHumanPromise;
}

function computeEyeOpenRatio(face: FaceResult): number | null {
  const leftUpper = face.annotations?.leftEyeUpper0;
  const leftLower = face.annotations?.leftEyeLower0;
  const rightUpper = face.annotations?.rightEyeUpper0;
  const rightLower = face.annotations?.rightEyeLower0;

  const measureEye = (
    upper?: [number, number, number?][],
    lower?: [number, number, number?][]
  ): number | null => {
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
  const irisGesture = gestures.find(
    (g): g is { iris: number; gesture: never } => 'iris' in g
  );
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
      return 'Quyền truy cập camera bị từ chối. Vui lòng cấp quyền camera trên trình duyệt rồi bấm Thử lại.';
    }
    if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      return 'Không tìm thấy thiết bị camera khả dụng trên máy của bạn.';
    }
    if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
      return 'Camera đang được ứng dụng khác sử dụng hoặc không thể mở luồng video.';
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

function formatFaceCoverLabel(cover: FaceCoverStatus | null | undefined): string {
  if (cover === 'mask') return 'Đang đeo khẩu trang';
  if (cover === 'full_cover') return 'Che kín mặt';
  return 'Không khẩu trang';
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function captureVideoFrameB64(
  video: HTMLVideoElement,
  maxWidth = PERIOCULAR_FRAME_MAX_WIDTH,
  quality = PERIOCULAR_FRAME_QUALITY
): string | null {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh || video.readyState < 2) return null;

  const targetWidth = Math.min(vw, maxWidth);
  const targetHeight = Math.max(1, Math.round((vh / vw) * targetWidth));
  const offscreen = document.createElement('canvas');
  offscreen.width = targetWidth;
  offscreen.height = targetHeight;

  try {
    const ctx = offscreen.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
    const dataUrl = offscreen.toDataURL('image/jpeg', quality);
    ctx.clearRect(0, 0, targetWidth, targetHeight);
    return dataUrl;
  } finally {
    offscreen.width = 0;
    offscreen.height = 0;
  }
}

function createPeriocularRoiState(): PeriocularRoiState {
  return {
    canvas: null,
    prevGray: null,
    eyeContrastBaseline: 0,
    pupilDarknessBaseline: 0,
    localMotionAccumulator: 0,
    inRoiBlink: false,
    blinkStartedAt: 0,
    roiBlinkCooldownUntil: 0,
    baselinePupilX: null,
    baselinePupilY: null,
  };
}

function resetPeriocularRoiState(state: PeriocularRoiState): void {
  state.prevGray = null;
  state.eyeContrastBaseline = 0;
  state.pupilDarknessBaseline = 0;
  state.localMotionAccumulator = 0;
  state.inRoiBlink = false;
  state.blinkStartedAt = 0;
  state.roiBlinkCooldownUntil = 0;
  state.baselinePupilX = null;
  state.baselinePupilY = null;
}

function releasePeriocularRoiState(state: PeriocularRoiState): void {
  resetPeriocularRoiState(state);
  if (state.canvas) {
    const ctx = state.canvas.getContext('2d');
    ctx?.clearRect(0, 0, state.canvas.width, state.canvas.height);
    state.canvas.width = 0;
    state.canvas.height = 0;
    state.canvas = null;
  }
}

interface NormalizedEyeLandmarks {
  left: [number, number];
  right: [number, number];
  updatedAt: number;
}

function analyzePeriocularRoiFrame(
  video: HTMLVideoElement,
  state: PeriocularRoiState,
  now: number,
  blinkCountSoFar: number,
  normalizedEyes?: NormalizedEyeLandmarks | null
): PeriocularRoiAnalysis {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh || video.readyState < 2) {
    return {
      meanFrameLuma: 0,
      eyesPresent: false,
      blinkActive: false,
      blinkTriggered: false,
      eyeOpennessScore: 1,
      liveness: 0,
      antispoof: 0,
      gazeDx: 0,
      gazeDy: 0,
    };
  }

  if (!state.canvas) {
    state.canvas = document.createElement('canvas');
    state.canvas.width = ROI_CANVAS_WIDTH;
    state.canvas.height = ROI_CANVAS_HEIGHT;
  } else if (
    state.canvas.width !== ROI_CANVAS_WIDTH ||
    state.canvas.height !== ROI_CANVAS_HEIGHT
  ) {
    state.canvas.width = ROI_CANVAS_WIDTH;
    state.canvas.height = ROI_CANVAS_HEIGHT;
  }

  const ctx = state.canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return {
      meanFrameLuma: 0,
      eyesPresent: false,
      blinkActive: false,
      blinkTriggered: false,
      eyeOpennessScore: 1,
      liveness: 0,
      antispoof: 0,
      gazeDx: 0,
      gazeDy: 0,
    };
  }

  ctx.drawImage(video, 0, 0, ROI_CANVAS_WIDTH, ROI_CANVAS_HEIGHT);
  const rgba = ctx.getImageData(0, 0, ROI_CANVAS_WIDTH, ROI_CANVAS_HEIGHT).data;
  const totalPixels = ROI_CANVAS_WIDTH * ROI_CANVAS_HEIGHT;
  const gray = new Uint8Array(totalPixels);

  let frameLumaSum = 0;
  for (let i = 0, p = 0; i < totalPixels; i += 1, p += 4) {
    const y = Math.round(
      0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2]
    );
    gray[i] = y;
    frameLumaSum += y;
  }
  const meanFrameLuma = frameLumaSum / totalPixels;

  // Đặt ô đo chớp mắt đúng theo tọa độ 2 mắt thật từ :8002 (hoặc dải rộng y:15%..78% nếu chưa có)
  let eyeBoxes: Array<{ x0: number; x1: number; y0: number; y1: number }>;
  if (normalizedEyes) {
    const lx = Math.round(normalizedEyes.left[0] * ROI_CANVAS_WIDTH);
    const ly = Math.round(normalizedEyes.left[1] * ROI_CANVAS_HEIGHT);
    const rxEye = Math.round(normalizedEyes.right[0] * ROI_CANVAS_WIDTH);
    const ryEye = Math.round(normalizedEyes.right[1] * ROI_CANVAS_HEIGHT);
    const eyeDistPx = Math.max(
      18,
      Math.hypot(rxEye - lx, ryEye - ly)
    );
    const halfW = Math.max(10, Math.min(24, Math.round(eyeDistPx * 0.28)));
    const halfH = Math.max(7, Math.min(16, Math.round(eyeDistPx * 0.18)));
    const clampBox = (cx: number, cy: number) => ({
      x0: Math.max(2, Math.min(ROI_CANVAS_WIDTH - 6, cx - halfW)),
      x1: Math.max(6, Math.min(ROI_CANVAS_WIDTH - 2, cx + halfW)),
      y0: Math.max(2, Math.min(ROI_CANVAS_HEIGHT - 6, cy - halfH)),
      y1: Math.max(6, Math.min(ROI_CANVAS_HEIGHT - 2, cy + halfH)),
    });
    eyeBoxes = [clampBox(lx, ly), clampBox(rxEye, ryEye)];
  } else {
    const rx = Math.round(ROI_CANVAS_WIDTH * PERIOCULAR_GUIDE_BOX.x);
    const ry = Math.round(ROI_CANVAS_HEIGHT * PERIOCULAR_GUIDE_BOX.y);
    const rw = Math.round(ROI_CANVAS_WIDTH * PERIOCULAR_GUIDE_BOX.w);
    const rh = Math.round(ROI_CANVAS_HEIGHT * PERIOCULAR_GUIDE_BOX.h);
    const eyeYStart = ry + Math.round(rh * 0.18);
    const eyeYEnd = ry + Math.round(rh * 0.84);
    eyeBoxes = [
      {
        x0: rx + Math.round(rw * 0.06),
        x1: rx + Math.round(rw * 0.43),
        y0: eyeYStart,
        y1: eyeYEnd,
      },
      {
        x0: rx + Math.round(rw * 0.57),
        x1: rx + Math.round(rw * 0.94),
        y0: eyeYStart,
        y1: eyeYEnd,
      },
    ];
  }

  let eyeSum = 0;
  let eyeSqSum = 0;
  let eyeCount = 0;
  let lapSum = 0;
  let verticalContrastSum = 0;
  let glareCount = 0;
  let eyeDiffSum = 0;
  let coreSum = 0;
  let coreCount = 0;
  let outerRingSum = 0;
  let outerRingCount = 0;

  const prev = state.prevGray;

  for (const box of eyeBoxes) {
    const bw = Math.max(1, box.x1 - box.x0);
    const bh = Math.max(1, box.y1 - box.y0);
    const coreX0 = box.x0 + bw * 0.3;
    const coreX1 = box.x0 + bw * 0.7;
    const coreY0 = box.y0 + bh * 0.3;
    const coreY1 = box.y0 + bh * 0.7;

    for (let y = box.y0; y < box.y1; y += 1) {
      const rowOff = y * ROI_CANVAS_WIDTH;
      const inCoreY = y >= coreY0 && y <= coreY1;
      for (let x = box.x0; x < box.x1; x += 1) {
        const idx = rowOff + x;
        const val = gray[idx];
        eyeSum += val;
        eyeSqSum += val * val;
        eyeCount += 1;
        if (val >= 246) glareCount += 1;

        if (inCoreY && x >= coreX0 && x <= coreX1) {
          coreSum += val;
          coreCount += 1;
        } else {
          outerRingSum += val;
          outerRingCount += 1;
        }

        const lap = Math.abs(
          4 * val -
            gray[idx - 1] -
            gray[idx + 1] -
            gray[idx - ROI_CANVAS_WIDTH] -
            gray[idx + ROI_CANVAS_WIDTH]
        );
        lapSum += lap;
        verticalContrastSum += Math.abs(val - gray[idx - 2 * ROI_CANVAS_WIDTH]);

        if (prev) {
          eyeDiffSum += Math.abs(val - prev[idx]);
        }
      }
    }
  }

  let outerDiffSum = 0;
  let outerCount = 0;
  if (prev) {
    for (let y = 2; y < 14; y += 1) {
      const rowOff = y * ROI_CANVAS_WIDTH;
      for (let x = 8; x < ROI_CANVAS_WIDTH - 8; x += 2) {
        const idx = rowOff + x;
        outerDiffSum += Math.abs(gray[idx] - prev[idx]);
        outerCount += 1;
      }
    }
  }

  state.prevGray = gray;

  if (eyeCount === 0) {
    return {
      meanFrameLuma,
      eyesPresent: false,
      blinkActive: false,
      blinkTriggered: false,
      eyeOpennessScore: 1,
      liveness: 0,
      antispoof: 0,
      gazeDx: 0,
      gazeDy: 0,
    };
  }

  const eyeMean = eyeSum / eyeCount;
  const eyeVariance = Math.max(0, eyeSqSum / eyeCount - eyeMean * eyeMean);
  const eyeStdDev = Math.sqrt(eyeVariance);
  const lapMean = lapSum / eyeCount;
  const verticalContrast = verticalContrastSum / eyeCount;
  const coreMean = coreCount > 0 ? coreSum / coreCount : eyeMean;
  const outerRingMean = outerRingCount > 0 ? outerRingSum / outerRingCount : eyeMean;
  const pupilDarkness = Math.max(0, outerRingMean - coreMean);
  const glareRatio = glareCount / eyeCount;

  const eyeLocalDiff = prev ? eyeDiffSum / eyeCount : 0;
  const outerDiff = prev && outerCount > 0 ? outerDiffSum / outerCount : 0;
  const localExcess = Math.max(0, eyeLocalDiff - outerDiff * 0.65);

  const eyesPresent = normalizedEyes
    ? eyeMean >= 18 &&
      eyeMean <= 238 &&
      glareRatio < 0.35 &&
      eyeStdDev >= 7.5 &&
      lapMean >= 4.0
    : eyeMean >= 30 &&
      eyeMean <= 238 &&
      glareRatio < 0.35 &&
      eyeStdDev >= 11.5 &&
      lapMean >= 6.5;

  let gazeDx = 0;
  let gazeDy = 0;
  if (eyesPresent && !state.inRoiBlink) {
    let pupilXSum = 0;
    let pupilYSum = 0;
    let boxUsed = 0;
    for (const box of eyeBoxes) {
      const bw = Math.max(1, box.x1 - box.x0);
      const bh = Math.max(1, box.y1 - box.y0);
      let wSum = 0;
      let wxSum = 0;
      let wySum = 0;
      for (let y = box.y0; y < box.y1; y += 1) {
        const rowOff = y * ROI_CANVAS_WIDTH;
        const ny = (y - box.y0) / bh;
        for (let x = box.x0; x < box.x1; x += 1) {
          const dark = Math.max(0, eyeMean - gray[rowOff + x]);
          if (dark > 4) {
            const w = dark * dark;
            wSum += w;
            wxSum += w * ((x - box.x0) / bw);
            wySum += w * ny;
          }
        }
      }
      if (wSum > 0) {
        pupilXSum += wxSum / wSum;
        pupilYSum += wySum / wSum;
        boxUsed += 1;
      }
    }
    if (boxUsed > 0) {
      const px = pupilXSum / boxUsed;
      const py = pupilYSum / boxUsed;
      if (state.baselinePupilX === null || state.baselinePupilY === null) {
        state.baselinePupilX = px;
        state.baselinePupilY = py;
      } else {
        gazeDx = px - state.baselinePupilX;
        gazeDy = py - state.baselinePupilY;
        if (Math.abs(gazeDx) < 0.03 && Math.abs(gazeDy) < 0.025) {
          state.baselinePupilX = state.baselinePupilX * 0.96 + px * 0.04;
          state.baselinePupilY = state.baselinePupilY * 0.96 + py * 0.04;
        }
      }
    }
  }

  let blinkTriggered = false;
  if (eyesPresent) {
    if (state.eyeContrastBaseline <= 0) {
      state.eyeContrastBaseline = verticalContrast;
    }
    if (state.pupilDarknessBaseline <= 0) {
      state.pupilDarknessBaseline = pupilDarkness;
    }

    const stableFrame = outerDiff <= 4.5;
    const pupilSignalValid = state.pupilDarknessBaseline > 2.5;
    const pupilDropped =
      pupilSignalValid &&
      pupilDarkness < state.pupilDarknessBaseline * 0.74;
    const contrastDropped =
      state.eyeContrastBaseline > 4 &&
      verticalContrast < state.eyeContrastBaseline * 0.78;
    const bothSignalsSoftDrop = pupilSignalValid
      ? (pupilDropped && verticalContrast < state.eyeContrastBaseline * 0.92) ||
        (contrastDropped && pupilDarkness < state.pupilDarknessBaseline * 0.88)
      : contrastDropped;
    const closingDrop = stableFrame && bothSignalsSoftDrop;

    if (state.inRoiBlink && state.blinkStartedAt > 0 && now - state.blinkStartedAt > 900) {
      state.inRoiBlink = false;
      state.blinkStartedAt = 0;
    } else if (!state.inRoiBlink && closingDrop && now >= state.roiBlinkCooldownUntil) {
      state.inRoiBlink = true;
      state.blinkStartedAt = now;
    } else if (
      state.inRoiBlink &&
      verticalContrast >= state.eyeContrastBaseline * 0.88 &&
      (!pupilSignalValid || pupilDarkness >= state.pupilDarknessBaseline * 0.82)
    ) {
      const blinkDuration = state.blinkStartedAt > 0 ? now - state.blinkStartedAt : 0;
      state.inRoiBlink = false;
      state.blinkStartedAt = 0;
      if (blinkDuration >= 55 && blinkDuration <= 900) {
        state.roiBlinkCooldownUntil = now + 450;
        blinkTriggered = true;
      }
    } else if (!state.inRoiBlink) {
      state.eyeContrastBaseline =
        state.eyeContrastBaseline * 0.92 + verticalContrast * 0.08;
      state.pupilDarknessBaseline =
        state.pupilDarknessBaseline * 0.92 + pupilDarkness * 0.08;
    }

    if (stableFrame && localExcess >= 1.1 && localExcess <= 28) {
      state.localMotionAccumulator = Math.min(
        8,
        state.localMotionAccumulator + 0.45
      );
    } else {
      state.localMotionAccumulator = Math.max(
        0,
        state.localMotionAccumulator - 0.05
      );
    }
  } else {
    state.inRoiBlink = false;
    state.blinkStartedAt = 0;
    state.localMotionAccumulator = Math.max(0, state.localMotionAccumulator - 0.2);
  }

  const contrastRatio =
    state.eyeContrastBaseline > 0 ? verticalContrast / state.eyeContrastBaseline : 1;
  const pupilRatio =
    state.pupilDarknessBaseline > 0 ? pupilDarkness / state.pupilDarknessBaseline : 1;
  const eyeOpennessScore = eyesPresent
    ? clamp01(0.5 * contrastRatio + 0.5 * pupilRatio)
    : 1;

  const contrastScore = clamp01((eyeStdDev - 8) / 22);
  const sharpnessScore = clamp01((lapMean - 4) / 18);
  const rawAntispoof = eyesPresent
    ? clamp01(0.45 * contrastScore + 0.55 * sharpnessScore - glareRatio * 0.7)
    : clamp01(0.25 * contrastScore + 0.25 * sharpnessScore);
  const antispoof =
    normalizedEyes && eyesPresent ? Math.max(0.7, rawAntispoof) : rawAntispoof;

  const effectiveBlinks = blinkCountSoFar + (blinkTriggered ? 1 : 0);
  const rawLiveness = eyesPresent
    ? clamp01(
        0.28 +
          Math.min(0.32, state.localMotionAccumulator * 0.06) +
          (effectiveBlinks >= 1 ? 0.25 : 0) +
          (state.inRoiBlink || blinkTriggered ? 0.1 : 0)
      )
    : 0.1;
  const liveness =
    normalizedEyes && eyesPresent ? Math.max(0.72, rawLiveness) : rawLiveness;

  return {
    meanFrameLuma,
    eyesPresent,
    blinkActive: state.inRoiBlink,
    blinkTriggered,
    eyeOpennessScore,
    liveness,
    antispoof,
    gazeDx,
    gazeDy,
  };
}

/**
 * Giữ mặt video camera sạch hoàn toàn tự nhiên — không vẽ khung, dấu chấm hay badge đè lên video.
 */
function drawOverlay(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement
): void {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) return;

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const ctx = canvas.getContext('2d');
  ctx?.clearRect(0, 0, width, height);
}

export function FaceLivenessAttendanceModal({
  open,
  mode,
  punchKind = 'CHECK_IN',
  employee,
  role,
  wifiStatus,
  existingProfile,
  punchActionLabel,
  onEnrolled,
  onPunchVerified,
  onDeleted,
  onClose,
}: FaceLivenessAttendanceModalProps) {
  const titleId = useId();
  const descId = useId();

  const [hideLivenessPanel, setHideLivenessPanel] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem('hrm_demo_hide_liveness') === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncDemoFlag = () => {
      try {
        setHideLivenessPanel(
          window.localStorage.getItem('hrm_demo_hide_liveness') === '1'
        );
      } catch {
        setHideLivenessPanel(false);
      }
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === 'hrm_demo_hide_liveness') {
        syncDemoFlag();
      }
    };
    syncDemoFlag();
    window.addEventListener('storage', handleStorage);
    window.addEventListener('hrm-demo-mode-change', syncDemoFlag);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('hrm-demo-mode-change', syncDemoFlag);
    };
  }, []);

  const [activeMode, setActiveMode] = useState<FaceLivenessModalMode>(mode);
  const [detectedPipeline, setDetectedPipeline] = useState<ScanModality>('full_face');
  const [periocularEngineOnline, setPeriocularEngineOnline] = useState<boolean | null>(
    null
  );
  const [engineHasPeriocularTemplate, setEngineHasPeriocularTemplate] =
    useState<boolean>(Boolean(existingProfile?.has_periocular_template));
  const [periocularUpgradedLocally, setPeriocularUpgradedLocally] =
    useState<boolean>(false);
  const [needsPeriocularUpgrade, setNeedsPeriocularUpgrade] = useState<boolean>(false);
  const [upgradeNotice, setUpgradeNotice] = useState<string>('');
  const [enrollThenPunch, setEnrollThenPunch] = useState<boolean>(false);
  const [recoveryNotice, setRecoveryNotice] = useState<string>('');
  const [profileDeletedLocally, setProfileDeletedLocally] = useState<boolean>(false);
  const [fetchedProfile, setFetchedProfile] = useState<
    FaceBiometricProfileDto | null | undefined
  >(undefined);
  const [detectedFaceCover, setDetectedFaceCover] = useState<FaceCoverStatus | null>(
    null
  );
  const [phase, setPhase] = useState<ModalPhase>('loading');
  const [cameraReady, setCameraReady] = useState<boolean>(false);
  const [loadingStep, setLoadingStep] = useState<string>('Đang khởi tạo hệ thống...');
  const [fatalError, setFatalError] = useState<string>('');
  const [submitError, setSubmitError] = useState<string>('');
  const [metrics, setMetrics] = useState<LiveMetrics>(INITIAL_METRICS);
  const [blinkCount, setBlinkCount] = useState<number>(0);
  const [deviceLabel, setDeviceLabel] = useState<string>(
    existingProfile?.device_label || DEFAULT_DEVICE_LABEL
  );
  const [confirmingDelete, setConfirmingDelete] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [isAutoVerifying, setIsAutoVerifying] = useState<boolean>(false);
  const [successSummary, setSuccessSummary] = useState<SuccessSummary | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const humanRef = useRef<Human | null>(null);
  const rafRef = useRef<number | null>(null);
  const autoSubmitTimerRef = useRef<number | null>(null);
  const sessionIdRef = useRef<number>(0);
  const wasOpenRef = useRef<boolean>(false);
  const isBlinkingRef = useRef<boolean>(false);
  const blinkCountRef = useRef<number>(0);
  const latestFaceRef = useRef<FaceResult | null>(null);
  const qualifiedFaceRef = useRef<QualifiedFaceSnapshot | null>(null);
  const qualifiedPeriocularRef = useRef<QualifiedPeriocularSnapshot | null>(null);
  const latestPeriocularMetricsRef = useRef<{
    hasEyes: boolean;
    liveness: number;
    antispoof: number;
  } | null>(null);
  const roiStateRef = useRef<PeriocularRoiState>(createPeriocularRoiState());
  const auxRingRef = useRef<{
    older: BufferedFrame | null;
    newer: BufferedFrame | null;
  }>({ older: null, newer: null });
  const blinkFrameRef = useRef<BufferedFrame | null>(null);
  const activePipelineRef = useRef<ScanModality>('full_face');
  const enrollThenPunchRef = useRef<boolean>(false);
  const hasPeriocularTemplateRef = useRef<boolean>(false);
  const needsPeriocularUpgradeRef = useRef<boolean>(false);
  const periocularEngineOnlineRef = useRef<boolean | null>(null);
  const detectedFaceCoverRef = useRef<FaceCoverStatus | null>(null);
  const maskProbeInFlightRef = useRef<boolean>(false);
  const lastMaskProbeAtRef = useRef<number>(0);
  const normalizedEyeLandmarksRef = useRef<NormalizedEyeLandmarks | null>(null);
  const isSubmittingRef = useRef<boolean>(false);
  const isDeletingRef = useRef<boolean>(false);
  const autoSubmitTriggeredRef = useRef<boolean>(false);
  const autoSubmitPausedRef = useRef<boolean>(false);
  const retryResetTimerRef = useRef<number | null>(null);
  const retryCountRef = useRef<number>(0);

  enrollThenPunchRef.current = enrollThenPunch;
  periocularEngineOnlineRef.current = periocularEngineOnline;
  detectedFaceCoverRef.current = detectedFaceCover;

  // Ref hóa các props/callbacks thay đổi theo re-render cha để chống phá màn success & cướp focus
  const modeRef = useRef<FaceLivenessModalMode>(mode);
  const punchKindRef = useRef<FacePunchKind>(punchKind);
  const employeeRef = useRef<Employee>(employee);
  const roleRef = useRef<RoleCode>(role);
  const wifiStatusRef = useRef<WifiVerificationResult | null>(wifiStatus);
  const effectiveExistingProfile = profileDeletedLocally
    ? null
    : fetchedProfile !== undefined
      ? fetchedProfile
      : existingProfile;
  const existingProfileRef = useRef<FaceBiometricProfileDto | null>(
    effectiveExistingProfile
  );
  const onCloseRef = useRef(onClose);
  const onEnrolledRef = useRef(onEnrolled);
  const onPunchVerifiedRef = useRef(onPunchVerified);
  const onDeletedRef = useRef(onDeleted);

  modeRef.current = mode;
  punchKindRef.current = punchKind;
  employeeRef.current = employee;
  roleRef.current = role;
  wifiStatusRef.current = wifiStatus;
  existingProfileRef.current = effectiveExistingProfile;
  onCloseRef.current = onClose;
  onEnrolledRef.current = onEnrolled;
  onPunchVerifiedRef.current = onPunchVerified;
  onDeletedRef.current = onDeleted;

  const releaseMediaResources = useCallback(() => {
    sessionIdRef.current += 1;
    if (autoSubmitTimerRef.current !== null) {
      window.clearTimeout(autoSubmitTimerRef.current);
      autoSubmitTimerRef.current = null;
    }
    if (retryResetTimerRef.current !== null) {
      window.clearTimeout(retryResetTimerRef.current);
      retryResetTimerRef.current = null;
    }
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
    releasePeriocularRoiState(roiStateRef.current);
    auxRingRef.current = { older: null, newer: null };
    blinkFrameRef.current = null;
    activePipelineRef.current = 'full_face';
    maskProbeInFlightRef.current = false;
    lastMaskProbeAtRef.current = 0;
    normalizedEyeLandmarksRef.current = null;
    latestFaceRef.current = null;
    if (qualifiedFaceRef.current) {
      qualifiedFaceRef.current.bestFrameB64 = null;
    }
    qualifiedFaceRef.current = null;
    qualifiedPeriocularRef.current = null;
    latestPeriocularMetricsRef.current = null;
    isBlinkingRef.current = false;
  }, []);

  const stopCameraAndLoop = useCallback(() => {
    releaseMediaResources();
    setCameraReady(false);
    setIsAutoVerifying(false);
  }, [releaseMediaResources]);

  const handleClose = useCallback(() => {
    if (isSubmittingRef.current || isDeletingRef.current) return;
    stopCameraAndLoop();
    onCloseRef.current();
  }, [stopCameraAndLoop]);

  const handleCloseRef = useRef(handleClose);
  handleCloseRef.current = handleClose;

  const startCameraAndModel = useCallback(
    async (bypassWifiPreflight = false) => {
      stopCameraAndLoop();
      const mySessionId = sessionIdRef.current;

      setFatalError('');
      setSubmitError('');
      setConfirmingDelete(false);
      setMetrics(INITIAL_METRICS);
      blinkCountRef.current = 0;
      setBlinkCount(0);
      autoSubmitTriggeredRef.current = false;
      autoSubmitPausedRef.current = false;
      retryCountRef.current = 0;
      setIsAutoVerifying(false);

      if (!employeeRef.current) {
        setPhase('error');
        setFatalError(
          'Không xác định được hồ sơ nhân viên đang chấm công. Vui lòng chọn lại nhân sự và thử lại.'
        );
        return;
      }

      const currentWifi = wifiStatusRef.current;
      if (!bypassWifiPreflight && currentWifi && !currentWifi.allowed) {
        setPhase('error');
        setFatalError(
          currentWifi.reason ||
            'Thiết bị hiện không chung mạng WiFi văn phòng. Vui lòng kết nối WiFi công ty và bấm Thử lại.'
        );
        return;
      }

      if (
        typeof navigator === 'undefined' ||
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
      ) {
        setPhase('error');
        setFatalError(
          'Trình duyệt hiện tại không hỗ trợ truy cập camera (navigator.mediaDevices.getUserMedia).'
        );
        return;
      }

      setPhase('loading');
      setLoadingStep(
        sharedHumanInstance
          ? 'Đang mở camera trước...'
          : 'Đang mở camera & tải model AI Liveness cục bộ...'
      );

      try {
        const cameraPromise = navigator.mediaDevices
          .getUserMedia({
            video: {
              facingMode: 'user',
              width: { ideal: 640 },
              height: { ideal: 480 },
            },
            audio: false,
          })
          .then((stream) => {
            if (sessionIdRef.current !== mySessionId) {
              stream.getTracks().forEach((track) => track.stop());
              return null;
            }
            streamRef.current = stream;
            setCameraReady(true);
            return stream;
          });

        const humanPromise = getSharedHuman((step) => {
          if (sessionIdRef.current === mySessionId) {
            setLoadingStep(step);
          }
        }).then((instance) => {
          if (sessionIdRef.current === mySessionId) {
            humanRef.current = instance;
          }
          return instance;
        });

        const [stream, humanInstance] = await Promise.all([
          cameraPromise,
          humanPromise,
        ]);

        if (sessionIdRef.current !== mySessionId || !stream || !humanInstance) {
          if (stream && sessionIdRef.current !== mySessionId) {
            stream.getTracks().forEach((track) => track.stop());
          }
          return;
        }

        streamRef.current = stream;
        humanRef.current = humanInstance;
        setCameraReady(true);
        setPhase('scanning');
      } catch (err) {
        if (sessionIdRef.current !== mySessionId) return;
        stopCameraAndLoop();
        setPhase('error');
        setFatalError(mapMediaError(err));
      }
    },
    [stopCameraAndLoop]
  );

  const probePeriocularEngine = useCallback(async () => {
    setPeriocularEngineOnline(null);
    const currentEmpId = employeeRef.current?.id;
    const currentEmpCode = employeeRef.current?.employee_code;
    try {
      const [status, profiles] = await Promise.all([
        fetchPeriocularEngineStatus(currentEmpId),
        fetchFaceBiometricProfiles(currentEmpId).catch(() => null),
      ]);
      const online = Boolean(status?.online);
      setPeriocularEngineOnline(online);
      if (Array.isArray(profiles)) {
        const matched =
          profiles.find(
            (p) =>
              p.employee_id === currentEmpId ||
              (currentEmpCode &&
                p.employee_code.toUpperCase() === currentEmpCode.toUpperCase())
          ) ?? null;
        setFetchedProfile(matched);
        if (matched) {
          setEngineHasPeriocularTemplate(Boolean(matched.has_periocular_template));
          setDeviceLabel((prev) => prev || matched.device_label || DEFAULT_DEVICE_LABEL);
        } else {
          setEngineHasPeriocularTemplate(false);
        }
      } else if (typeof status?.hasPeriocularTemplate === 'boolean') {
        setEngineHasPeriocularTemplate(
          Boolean(
            existingProfileRef.current?.has_periocular_template ||
              status.hasPeriocularTemplate
          )
        );
      }
    } catch {
      setPeriocularEngineOnline(false);
    }
  }, []);

  // Đồng bộ khi prop existingProfile từ cha bị xóa hoặc thay đổi
  useEffect(() => {
    if (!existingProfile) {
      setProfileDeletedLocally(false);
      setFetchedProfile(undefined);
      setEngineHasPeriocularTemplate(false);
      setPeriocularUpgradedLocally(false);
      setNeedsPeriocularUpgrade(false);
      return;
    }
    setProfileDeletedLocally(false);
    setFetchedProfile(existingProfile);
    setEngineHasPeriocularTemplate(Boolean(existingProfile.has_periocular_template));
  }, [existingProfile]);

  // Chỉ khởi động camera 1 lần khi modal chuyển từ đóng -> mở (KHÔNG chạy lại khi parent re-render)
  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      stopCameraAndLoop();
      setConfirmingDelete(false);
      setSuccessSummary(null);
      setNeedsPeriocularUpgrade(false);
      setUpgradeNotice('');
      setEnrollThenPunch(false);
      enrollThenPunchRef.current = false;
      setRecoveryNotice('');
      setProfileDeletedLocally(false);
      setFetchedProfile(undefined);
      setDetectedFaceCover(null);
      detectedFaceCoverRef.current = null;
      setDetectedPipeline('full_face');
      activePipelineRef.current = 'full_face';
      maskProbeInFlightRef.current = false;
      lastMaskProbeAtRef.current = 0;
      normalizedEyeLandmarksRef.current = null;
      return;
    }

    if (!wasOpenRef.current) {
      wasOpenRef.current = true;
      setActiveMode(modeRef.current);
      setDetectedPipeline('full_face');
      activePipelineRef.current = 'full_face';
      setSuccessSummary(null);
      setNeedsPeriocularUpgrade(false);
      setPeriocularUpgradedLocally(false);
      setUpgradeNotice('');
      setEnrollThenPunch(false);
      enrollThenPunchRef.current = false;
      setRecoveryNotice('');
      setProfileDeletedLocally(false);
      setFetchedProfile(undefined);
      setDetectedFaceCover(null);
      detectedFaceCoverRef.current = null;
      maskProbeInFlightRef.current = false;
      lastMaskProbeAtRef.current = 0;
      normalizedEyeLandmarksRef.current = null;
      setEngineHasPeriocularTemplate(
        Boolean(existingProfileRef.current?.has_periocular_template)
      );
      setDeviceLabel(existingProfileRef.current?.device_label || DEFAULT_DEVICE_LABEL);
      void probePeriocularEngine();
      void startCameraAndModel(false);
    }
  }, [open, probePeriocularEngine, startCameraAndModel, stopCameraAndLoop]);

  // Dọn tài nguyên media khi component unmount (reset wasOpenRef để an toàn React 18 StrictMode)
  useEffect(() => {
    return () => {
      wasOpenRef.current = false;
      releaseMediaResources();
    };
  }, [releaseMediaResources]);

  // Quản lý focus & phím Escape theo WCAG 2.2 AA — CHỈ phụ thuộc [open] để không cướp focus mỗi giây
  useEffect(() => {
    if (!open) return;

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusTimer = window.setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 30);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmittingRef.current && !isDeletingRef.current) {
        event.preventDefault();
        handleCloseRef.current();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [open]);

  // Phát hình camera ngay lập tức khi có quyền stream (ngay cả khi model đang tải xong lần đầu)
  useEffect(() => {
    if (!open || !cameraReady) return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;

    if (video.srcObject !== stream) {
      video.srcObject = stream;
    }
    void video.play().catch(() => {
      // Bỏ qua lỗi play nếu modal vừa đóng hoặc trình duyệt tạm dừng
    });
  }, [open, cameraReady]);

  // Vòng lặp nhận diện khuôn mặt real-time khi phase === 'scanning'
  useEffect(() => {
    if (!open || phase !== 'scanning') return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const stream = streamRef.current;
    const human = humanRef.current;
    if (!video || !canvas || !stream || !human) return;

    let cancelled = false;
    const mySessionId = sessionIdRef.current;
    if (video.srcObject !== stream) {
      video.srcObject = stream;
    }

    const probeMaskAndEyes = async (
      frameB64: string,
      frameW: number,
      frameH: number
    ) => {
      maskProbeInFlightRef.current = true;
      let localFrame: string | null = frameB64;
      try {
        const res = await checkFaceMaskStatus(localFrame);
        if (cancelled || sessionIdRef.current !== mySessionId) return;
        if (!res.online) {
          setPeriocularEngineOnline(false);
          return;
        }
        setPeriocularEngineOnline(true);
        if (res.ok && res.faceCover !== 'none') {
          if (qualifiedFaceRef.current) {
            qualifiedFaceRef.current.bestFrameB64 = null;
          }
          qualifiedFaceRef.current = null;
        }
        if (res.ok && res.eyeLandmarks && frameW > 0 && frameH > 0) {
          setDetectedFaceCover(res.faceCover);
          detectedFaceCoverRef.current = res.faceCover;
          normalizedEyeLandmarksRef.current = {
            left: [
              clamp01(res.eyeLandmarks.left[0] / frameW),
              clamp01(res.eyeLandmarks.left[1] / frameH),
            ],
            right: [
              clamp01(res.eyeLandmarks.right[0] / frameW),
              clamp01(res.eyeLandmarks.right[1] / frameH),
            ],
            updatedAt: Date.now(),
          };
        } else if (
          normalizedEyeLandmarksRef.current &&
          Date.now() - normalizedEyeLandmarksRef.current.updatedAt > EYE_LANDMARK_TTL_MS
        ) {
          normalizedEyeLandmarksRef.current = null;
        }
      } catch {
        // Bỏ qua lỗi probe đơn lẻ
      } finally {
        localFrame = null;
        maskProbeInFlightRef.current = false;
      }
    };

    const runLoop = async () => {
      try {
        if (video.paused) {
          await video.play();
        }
      } catch {
        return;
      }

      const detectFrame = async () => {
        if (cancelled || sessionIdRef.current !== mySessionId) return;

        if (video.readyState >= 2 && !video.paused && !video.ended) {
          try {
            const result = await human.detect(video);
            if (cancelled || sessionIdRef.current !== mySessionId) return;

            drawOverlay(canvas, video);

            const face = result.face?.[0] ?? null;
            latestFaceRef.current = face;
            const now = Date.now();

            if (face) {
              // Nhánh full-face Best-Frame tự động (server hỗ trợ Hybrid ONNX + auto-backfill)
              if (activePipelineRef.current !== 'full_face') {
                activePipelineRef.current = 'full_face';
                setDetectedPipeline('full_face');
              }
              normalizedEyeLandmarksRef.current = null;

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

              if (
                currentlyBlinking &&
                (!blinkFrameRef.current || now - blinkFrameRef.current.capturedAt >= 300)
              ) {
                const blinkCapture = captureVideoFrameB64(
                  video,
                  PERIOCULAR_FRAME_MAX_WIDTH,
                  PERIOCULAR_FRAME_QUALITY
                );
                if (blinkCapture) {
                  blinkFrameRef.current = { dataUrl: blinkCapture, capturedAt: now };
                }
              }

              const liveVal = typeof face.live === 'number' ? face.live : null;
              const realVal = typeof face.real === 'number' ? face.real : null;
              const embeddingReady =
                Array.isArray(face.embedding) && face.embedding.length >= 64;

              if (
                embeddingReady &&
                face.embedding &&
                !currentlyBlinking &&
                (ear === null || ear >= 0.24) &&
                liveVal !== null &&
                realVal !== null &&
                liveVal >= THRESHOLD_LIVENESS &&
                realVal >= THRESHOLD_ANTISPOOF
              ) {
                const qualityScore =
                  liveVal * 0.45 +
                  realVal * 0.4 +
                  Math.min(0.35, ear ?? 0.28) * 0.43;
                const prevBest = qualifiedFaceRef.current;
                const prevExpired =
                  !prevBest || now - prevBest.capturedAt > SNAPSHOT_GRACE_MS;
                if (prevExpired || qualityScore >= prevBest.qualityScore - 0.02) {
                  if (prevBest) {
                    prevBest.bestFrameB64 = null;
                  }
                  qualifiedFaceRef.current = {
                    embedding: [...face.embedding],
                    liveness: liveVal,
                    antispoof: realVal,
                    qualityScore,
                    bestFrameB64: captureVideoFrameB64(
                      video,
                      PERIOCULAR_FRAME_MAX_WIDTH,
                      PERIOCULAR_FRAME_QUALITY
                    ),
                    capturedAt: now,
                  };
                }
              }

              setMetrics({
                hasFace: true,
                liveness: liveVal,
                antispoof: realVal,
                gazeLabel: formatGazeLabel(result.gesture, face),
                blinkActive: currentlyBlinking,
                embeddingReady,
              });
            } else {
              // Nhánh periocular chạy ngầm tự động khi đeo khẩu trang / che mặt dưới
              if (activePipelineRef.current !== 'periocular') {
                activePipelineRef.current = 'periocular';
                setDetectedPipeline('periocular');
              }

              if (
                !maskProbeInFlightRef.current &&
                periocularEngineOnlineRef.current !== false &&
                video.videoWidth > 0 &&
                video.videoHeight > 0 &&
                now - lastMaskProbeAtRef.current >= MASK_PROBE_INTERVAL_MS
              ) {
                lastMaskProbeAtRef.current = now;
                const probeW = Math.min(video.videoWidth, PERIOCULAR_FRAME_MAX_WIDTH);
                const probeH = Math.max(
                  1,
                  Math.round((video.videoHeight / video.videoWidth) * probeW)
                );
                const probeFrame = captureVideoFrameB64(
                  video,
                  PERIOCULAR_FRAME_MAX_WIDTH,
                  PERIOCULAR_FRAME_QUALITY
                );
                if (probeFrame) {
                  void probeMaskAndEyes(probeFrame, probeW, probeH);
                }
              }

              const activeEyeCoords =
                normalizedEyeLandmarksRef.current &&
                now - normalizedEyeLandmarksRef.current.updatedAt <= EYE_LANDMARK_TTL_MS
                  ? normalizedEyeLandmarksRef.current
                  : null;

              const roi = analyzePeriocularRoiFrame(
                video,
                roiStateRef.current,
                now,
                blinkCountRef.current,
                activeEyeCoords
              );

              isBlinkingRef.current = roi.blinkActive;
              let justFinishedBlink = false;
              if (roi.blinkTriggered && activeEyeCoords) {
                blinkCountRef.current += 1;
                setBlinkCount(blinkCountRef.current);
                justFinishedBlink = true;
              }

              const eyesDetected = Boolean(activeEyeCoords && roi.eyesPresent);
              if (
                eyesDetected &&
                roi.blinkActive &&
                (!blinkFrameRef.current ||
                  typeof blinkFrameRef.current.eyeOpennessScore !== 'number' ||
                  roi.eyeOpennessScore < blinkFrameRef.current.eyeOpennessScore ||
                  now - blinkFrameRef.current.capturedAt >= 300)
              ) {
                const blinkCapture = captureVideoFrameB64(
                  video,
                  PERIOCULAR_FRAME_MAX_WIDTH,
                  PERIOCULAR_FRAME_QUALITY
                );
                if (blinkCapture) {
                  blinkFrameRef.current = {
                    dataUrl: blinkCapture,
                    capturedAt: now,
                    eyeOpennessScore: roi.eyeOpennessScore,
                  };
                }
              }
              const liveVal = eyesDetected ? roi.liveness : 0;
              const realVal = eyesDetected ? roi.antispoof : 0;

              if (eyesDetected) {
                const latestAux = auxRingRef.current.newer;
                if (
                  !latestAux ||
                  justFinishedBlink ||
                  now - latestAux.capturedAt >= 700
                ) {
                  const frameData = captureVideoFrameB64(
                    video,
                    PERIOCULAR_FRAME_MAX_WIDTH,
                    PERIOCULAR_FRAME_QUALITY
                  );
                  if (frameData) {
                    auxRingRef.current = {
                      older: latestAux,
                      newer: { dataUrl: frameData, capturedAt: now },
                    };
                  }
                }

                if (
                  liveVal >= THRESHOLD_LIVENESS &&
                  realVal >= THRESHOLD_ANTISPOOF
                ) {
                  qualifiedPeriocularRef.current = {
                    liveness: liveVal,
                    antispoof: realVal,
                    capturedAt: now,
                  };
                }
              }

              latestPeriocularMetricsRef.current = {
                hasEyes: eyesDetected,
                liveness: liveVal,
                antispoof: realVal,
              };

              setMetrics({
                hasFace: eyesDetected,
                liveness: eyesDetected ? liveVal : null,
                antispoof: eyesDetected ? realVal : null,
                gazeLabel: eyesDetected ? 'Nhận diện khuôn mặt' : 'Đang tìm khuôn mặt',
                blinkActive: roi.blinkActive,
                embeddingReady: false,
              });
            }
          } catch {
            // Bỏ qua lỗi frame đơn lẻ để giữ vòng lặp ổn định
          }
        }

        if (!cancelled && sessionIdRef.current === mySessionId) {
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
  }, [open, phase]);

  const handleResetScan = useCallback(() => {
    if (autoSubmitTimerRef.current !== null) {
      window.clearTimeout(autoSubmitTimerRef.current);
      autoSubmitTimerRef.current = null;
    }
    if (retryResetTimerRef.current !== null) {
      window.clearTimeout(retryResetTimerRef.current);
      retryResetTimerRef.current = null;
    }
    setSubmitError('');
    setConfirmingDelete(false);
    setIsAutoVerifying(false);
    autoSubmitPausedRef.current = false;
    autoSubmitTriggeredRef.current = false;
    retryCountRef.current = 0;
    blinkCountRef.current = 0;
    setBlinkCount(0);
    isBlinkingRef.current = false;
    if (qualifiedFaceRef.current) {
      qualifiedFaceRef.current.bestFrameB64 = null;
    }
    qualifiedFaceRef.current = null;
    qualifiedPeriocularRef.current = null;
    latestPeriocularMetricsRef.current = null;
    auxRingRef.current = { older: null, newer: null };
    blinkFrameRef.current = null;
    normalizedEyeLandmarksRef.current = null;
    maskProbeInFlightRef.current = false;
    lastMaskProbeAtRef.current = 0;
    resetPeriocularRoiState(roiStateRef.current);
  }, []);

  const switchToReenrollAndPunch = useCallback(
    (noticeMsg?: string) => {
      if (isSubmittingRef.current || isDeletingRef.current) return;
      enrollThenPunchRef.current = true;
      setEnrollThenPunch(true);
      setActiveMode('enroll');
      setUpgradeNotice('');
      setRecoveryNotice(
        noticeMsg ||
          'Vui lòng nhìn thẳng vào camera & chớp mắt 1 lần để lưu lại mẫu mới và tự động chấm công.'
      );
      handleResetScan();
    },
    [handleResetScan]
  );

  const handleSubmit = useCallback(
    async (options?: { upgradePeriocular?: boolean }) => {
      const currentEmployee = employeeRef.current;
      if (
        !currentEmployee ||
        isSubmittingRef.current ||
        isDeletingRef.current ||
        phase !== 'scanning'
      ) {
        return;
      }

      if (autoSubmitTimerRef.current !== null) {
        window.clearTimeout(autoSubmitTimerRef.current);
        autoSubmitTimerRef.current = null;
      }
      if (retryResetTimerRef.current !== null) {
        window.clearTimeout(retryResetTimerRef.current);
        retryResetTimerRef.current = null;
      }

      const isPeriocularUpgrade = options?.upgradePeriocular === true;
      const currentFace = latestFaceRef.current;
      const currentEmbedding =
        currentFace?.embedding && currentFace.embedding.length >= 64
          ? [...currentFace.embedding]
          : null;
      const currentLive = typeof currentFace?.live === 'number' ? currentFace.live : 0;
      const currentReal = typeof currentFace?.real === 'number' ? currentFace.real : 0;

      let selectedEmbedding: number[] | null = null;
      let selectedLiveness = currentLive;
      let selectedAntispoof = currentReal;
      let selectedBestFrameB64: string | null = null;

      if (
        qualifiedFaceRef.current &&
        Date.now() - qualifiedFaceRef.current.capturedAt <= SNAPSHOT_GRACE_MS
      ) {
        selectedEmbedding = qualifiedFaceRef.current.embedding;
        selectedLiveness = qualifiedFaceRef.current.liveness;
        selectedAntispoof = qualifiedFaceRef.current.antispoof;
        selectedBestFrameB64 = qualifiedFaceRef.current.bestFrameB64 ?? null;
      } else if (
        currentEmbedding &&
        currentLive >= THRESHOLD_LIVENESS &&
        currentReal >= THRESHOLD_ANTISPOOF
      ) {
        selectedEmbedding = currentEmbedding;
      }

      const hasFullFaceSignal = Boolean(selectedEmbedding);
      const hasPeriocularSignal =
        Boolean(latestPeriocularMetricsRef.current?.hasEyes) ||
        (qualifiedPeriocularRef.current !== null &&
          Date.now() - qualifiedPeriocularRef.current.capturedAt <= SNAPSHOT_GRACE_MS);

      const effectiveModality: ScanModality = isPeriocularUpgrade
        ? 'periocular'
        : hasFullFaceSignal
          ? 'full_face'
          : activePipelineRef.current === 'periocular' || hasPeriocularSignal
            ? 'periocular'
            : 'full_face';

      if (effectiveModality === 'periocular') {
        const latestPeri = latestPeriocularMetricsRef.current;
        if (
          latestPeri?.hasEyes &&
          latestPeri.liveness >= THRESHOLD_LIVENESS &&
          latestPeri.antispoof >= THRESHOLD_ANTISPOOF
        ) {
          selectedLiveness = latestPeri.liveness;
          selectedAntispoof = latestPeri.antispoof;
        } else if (
          qualifiedPeriocularRef.current &&
          Date.now() - qualifiedPeriocularRef.current.capturedAt <= SNAPSHOT_GRACE_MS
        ) {
          selectedLiveness = qualifiedPeriocularRef.current.liveness;
          selectedAntispoof = qualifiedPeriocularRef.current.antispoof;
        } else {
          selectedLiveness = latestPeri?.liveness ?? 0;
          selectedAntispoof = latestPeri?.antispoof ?? 0;
        }
      }

      const blinks = blinkCountRef.current;
      const isEnrollSubmit = isPeriocularUpgrade || activeMode === 'enroll';
      const requiredBlinks = isEnrollSubmit ? 0 : THRESHOLD_BLINKS;
      const checksValid =
        effectiveModality === 'periocular'
          ? hasPeriocularSignal &&
            selectedLiveness >= THRESHOLD_LIVENESS &&
            selectedAntispoof >= THRESHOLD_ANTISPOOF &&
            blinks >= requiredBlinks
          : hasFullFaceSignal &&
            selectedLiveness >= THRESHOLD_LIVENESS &&
            selectedAntispoof >= THRESHOLD_ANTISPOOF &&
            blinks >= requiredBlinks;

      if (!checksValid) {
        autoSubmitTriggeredRef.current = false;
        setIsAutoVerifying(false);
        setSubmitError(
          'Vui lòng nhìn thẳng vào camera, đạt Liveness ≥ 50%, Chống giả mạo ≥ 50% và chớp mắt ít nhất 1 lần.'
        );
        return;
      }

      setSubmitError('');
      setUpgradeNotice('');
      setConfirmingDelete(false);
      autoSubmitTriggeredRef.current = true;
      isSubmittingRef.current = true;
      setPhase('submitting');

      let periocularFrameB64: string | null = null;
      let periocularAuxFrameB64: string | null = null;

      try {
        const video = videoRef.current;
        if (effectiveModality === 'periocular') {
          if (video) {
            const nowCapture = Date.now();
            const blinkSnap = blinkFrameRef.current;
            const newer = auxRingRef.current.newer;
            const older = auxRingRef.current.older;

            if (blinkSnap) {
              periocularAuxFrameB64 = blinkSnap.dataUrl;
              if (nowCapture - blinkSnap.capturedAt < PERIOCULAR_AUX_MIN_GAP_MS) {
                await new Promise((resolve) =>
                  window.setTimeout(
                    resolve,
                    PERIOCULAR_AUX_MIN_GAP_MS - (nowCapture - blinkSnap.capturedAt) + 15
                  )
                );
              }
              periocularFrameB64 = captureVideoFrameB64(
                video,
                PERIOCULAR_FRAME_MAX_WIDTH,
                PERIOCULAR_FRAME_QUALITY
              );
            } else if (
              newer &&
              nowCapture - newer.capturedAt >= PERIOCULAR_AUX_MIN_GAP_MS
            ) {
              periocularAuxFrameB64 = newer.dataUrl;
              periocularFrameB64 = captureVideoFrameB64(
                video,
                PERIOCULAR_FRAME_MAX_WIDTH,
                PERIOCULAR_FRAME_QUALITY
              );
            } else if (
              older &&
              nowCapture - older.capturedAt >= PERIOCULAR_AUX_MIN_GAP_MS
            ) {
              periocularAuxFrameB64 = older.dataUrl;
              periocularFrameB64 = captureVideoFrameB64(
                video,
                PERIOCULAR_FRAME_MAX_WIDTH,
                PERIOCULAR_FRAME_QUALITY
              );
            } else {
              periocularAuxFrameB64 =
                newer?.dataUrl ??
                captureVideoFrameB64(
                  video,
                  PERIOCULAR_FRAME_MAX_WIDTH,
                  PERIOCULAR_FRAME_QUALITY
                );
              await new Promise((resolve) =>
                window.setTimeout(resolve, PERIOCULAR_AUX_MIN_GAP_MS + 15)
              );
              periocularFrameB64 = captureVideoFrameB64(
                video,
                PERIOCULAR_FRAME_MAX_WIDTH,
                PERIOCULAR_FRAME_QUALITY
              );
            }
          }

          if (!periocularFrameB64) {
            throw new FaceBiometricFlowError(
              'NO_PERIOCULAR_DETECTED',
              'Không chụp được khung hình khuôn mặt từ camera. Vui lòng thử lại.'
            );
          }
        } else {
          periocularFrameB64 =
            selectedBestFrameB64 ??
            (video
              ? captureVideoFrameB64(
                  video,
                  PERIOCULAR_FRAME_MAX_WIDTH,
                  PERIOCULAR_FRAME_QUALITY
                )
              : null);
          if (activeMode === 'punch') {
            periocularAuxFrameB64 =
              blinkFrameRef.current?.dataUrl ??
              auxRingRef.current.older?.dataUrl ??
              null;
          }
        }

        const completePunchSuccess = async (res: {
          profile: FaceBiometricProfileDto;
          similarity: number;
          liveness: number;
          antispoof: number;
          blinkCount: number;
          wifi: WifiVerificationResult;
          verifiedAt: string;
          faceCover?: FaceCoverStatus;
        }) => {
          const resolvedCover: FaceCoverStatus =
            res.faceCover ??
            detectedFaceCoverRef.current ??
            (effectiveModality === 'periocular' ? 'mask' : 'none');
          setDetectedFaceCover(resolvedCover);
          detectedFaceCoverRef.current = resolvedCover;

          const recordResult = await onPunchVerifiedRef.current({
            similarity: res.similarity,
            liveness: res.liveness,
            antispoof: res.antispoof,
            blinkCount: res.blinkCount,
            wifi: res.wifi,
            deviceLabel: res.profile.device_label || DEFAULT_DEVICE_LABEL,
            profile: res.profile,
            verifiedAt: res.verifiedAt,
          });

          stopCameraAndLoop();
          setEnrollThenPunch(false);
          enrollThenPunchRef.current = false;
          setRecoveryNotice('');
          const resolvedAction: FacePunchKind =
            recordResult?.action ?? punchKindRef.current;
          setSuccessSummary({
            kind: resolvedAction,
            deviceLabel: res.profile.device_label || DEFAULT_DEVICE_LABEL,
            wifiIp: res.wifi.verifiedIp || res.wifi.clientObservedIp || 'Nội bộ',
            wifiSsidLabel: res.wifi.policy?.wifi_ssid_label,
            similarity: res.similarity,
            liveness: res.liveness,
            antispoof: res.antispoof,
            faceCover: resolvedCover,
            checkIn: recordResult?.checkIn ?? null,
            checkOut: recordResult?.checkOut ?? null,
            shiftCode: recordResult?.shiftCode,
            workdayValue: recordResult?.workdayValue,
          });
          setPhase('success');
        };

        if (isPeriocularUpgrade || activeMode === 'enroll') {
          const res = await registerFaceBiometricProfile({
            employee: currentEmployee,
            role: roleRef.current,
            embedding: selectedEmbedding ?? undefined,
            liveness: selectedLiveness,
            antispoof: selectedAntispoof,
            blinkCount: Math.max(1, blinks),
            deviceLabel: deviceLabel.trim() || DEFAULT_DEVICE_LABEL,
            scanModality: effectiveModality,
            periocularFrameB64: periocularFrameB64 ?? undefined,
            periocularAuxFrameB64: periocularAuxFrameB64 ?? undefined,
            upgradePeriocular: isPeriocularUpgrade || undefined,
            replaceExisting:
              isPeriocularUpgrade || enrollThenPunchRef.current ? true : undefined,
          });

          const updatedProfiles =
            res.faceProfiles.length > 0 ? res.faceProfiles : [res.profile];
          onEnrolledRef.current(updatedProfiles, {
            profile: res.profile,
            wifi: res.wifi,
          });

          if (res.profile.has_periocular_template || effectiveModality === 'periocular') {
            setPeriocularUpgradedLocally(true);
            setEngineHasPeriocularTemplate(true);
            setNeedsPeriocularUpgrade(false);
          }

          if (isPeriocularUpgrade && activeMode === 'punch') {
            autoSubmitPausedRef.current = false;
            autoSubmitTriggeredRef.current = false;
            blinkCountRef.current = 0;
            setBlinkCount(0);
            qualifiedPeriocularRef.current = null;
            setUpgradeNotice(
              'Đã cập nhật dữ liệu khuôn mặt. Giữ mặt trong khung & chớp mắt để chấm công.'
            );
            setPhase('scanning');
          } else if (activeMode === 'enroll' && enrollThenPunchRef.current) {
            const punchRes = await verifyFaceBiometricPunch({
              employee: currentEmployee,
              role: roleRef.current,
              embedding: selectedEmbedding ?? undefined,
              liveness: selectedLiveness,
              antispoof: selectedAntispoof,
              blinkCount: blinks,
              scanModality: effectiveModality,
              periocularFrameB64: periocularFrameB64 ?? undefined,
              periocularAuxFrameB64: periocularAuxFrameB64 ?? undefined,
            });
            await completePunchSuccess(punchRes);
          } else {
            stopCameraAndLoop();
            const enrollCover: FaceCoverStatus =
              detectedFaceCoverRef.current ??
              (effectiveModality === 'periocular' ? 'mask' : 'none');
            setSuccessSummary({
              kind: 'enroll',
              deviceLabel: res.profile.device_label || DEFAULT_DEVICE_LABEL,
              wifiIp: res.wifi.verifiedIp || res.wifi.clientObservedIp || 'Nội bộ',
              wifiSsidLabel: res.wifi.policy?.wifi_ssid_label,
              embeddingDim: res.profile.embedding_dim,
              liveness: selectedLiveness,
              antispoof: selectedAntispoof,
              faceCover: enrollCover,
            });
            setPhase('success');
          }
        } else {
          const res = await verifyFaceBiometricPunch({
            employee: currentEmployee,
            role: roleRef.current,
            embedding: selectedEmbedding ?? undefined,
            liveness: selectedLiveness,
            antispoof: selectedAntispoof,
            blinkCount: blinks,
            scanModality: effectiveModality,
            periocularFrameB64: periocularFrameB64 ?? undefined,
            periocularAuxFrameB64: periocularAuxFrameB64 ?? undefined,
          });

        await completePunchSuccess(res);
        retryCountRef.current = 0;
        }
      } catch (err) {
        autoSubmitPausedRef.current = true;
        setIsAutoVerifying(false);
        let msg = 'Xác thực khuôn mặt không thành công. Vui lòng thử lại.';
        let shouldScheduleAutoRetry = false;
        if (err instanceof FaceBiometricFlowError) {
          if (
            err.code === 'PROFILE_NOT_FOUND' ||
            err.code === 'FACE_PROFILE_NOT_FOUND' ||
            err.status === 404
          ) {
            setProfileDeletedLocally(true);
            setFetchedProfile(null);
            existingProfileRef.current = null;
            setEngineHasPeriocularTemplate(false);
            setPeriocularUpgradedLocally(false);
            msg =
              'Không nhận diện được — tài khoản chưa có dữ liệu khuôn mặt.';
          } else if (
            err.code === 'PERIOCULAR_TEMPLATE_MISSING' ||
            err.status === 409
          ) {
            setNeedsPeriocularUpgrade(true);
            msg =
              'Hồ sơ hiện tại chưa có dữ liệu khuôn mặt. Vui lòng thiết lập lại dữ liệu khuôn mặt.';
          } else if (
            err.code === 'FACE_MISMATCH' ||
            err.code === 'LIVENESS_FAILED'
          ) {
            retryCountRef.current += 1;
            if (retryCountRef.current < MAX_AUTO_RETRY_ATTEMPTS) {
              msg = err.message;
              shouldScheduleAutoRetry = true;
            } else {
              msg =
                err.code === 'FACE_MISMATCH'
                  ? 'Từ chối xác thực: Khuôn mặt không khớp với hồ sơ nhân viên (đã thử 3/3 lần).'
                  : 'Từ chối xác thực: Không đạt kiểm tra người thật sau 3/3 lần thử.';
            }
          } else {
            msg = err.message;
          }
        } else if (err instanceof Error) {
          msg = err.message;
        }
        setSubmitError(msg);
        if (streamRef.current && streamRef.current.active) {
          setPhase('scanning');
          if (shouldScheduleAutoRetry) {
            const errorSessionId = sessionIdRef.current;
            if (retryResetTimerRef.current !== null) {
              window.clearTimeout(retryResetTimerRef.current);
            }
            retryResetTimerRef.current = window.setTimeout(() => {
              retryResetTimerRef.current = null;
              if (
                sessionIdRef.current !== errorSessionId ||
                !streamRef.current ||
                !streamRef.current.active
              ) {
                return;
              }
              setSubmitError('');
              blinkCountRef.current = 0;
              setBlinkCount(0);
              isBlinkingRef.current = false;
              qualifiedFaceRef.current = null;
              qualifiedPeriocularRef.current = null;
              auxRingRef.current = { older: null, newer: null };
              blinkFrameRef.current = null;
              autoSubmitTriggeredRef.current = false;
              autoSubmitPausedRef.current = false;
            }, 1600);
          }
        } else {
          setFatalError(msg);
          setPhase('error');
        }
      } finally {
        selectedBestFrameB64 = null;
        periocularFrameB64 = null;
        periocularAuxFrameB64 = null;
        if (qualifiedFaceRef.current) {
          qualifiedFaceRef.current.bestFrameB64 = null;
        }
        blinkFrameRef.current = null;
        auxRingRef.current = { older: null, newer: null };
        isSubmittingRef.current = false;
      }
    },
    [activeMode, deviceLabel, phase, stopCameraAndLoop]
  );

  const handleSubmitPunchRef = useRef(handleSubmit);
  handleSubmitPunchRef.current = handleSubmit;

  const handleDeleteExistingProfile = useCallback(async () => {
    const currentProfile = existingProfileRef.current;
    const currentEmployee = employeeRef.current;
    if (
      roleRef.current !== 'SUPER_ADMIN' ||
      !currentProfile ||
      !currentEmployee ||
      isSubmittingRef.current ||
      isDeletingRef.current
    ) {
      return;
    }
    setSubmitError('');
    isDeletingRef.current = true;
    setIsDeleting(true);
    try {
      const res = await deleteFaceBiometricProfile({
        employee: currentEmployee,
        role: roleRef.current,
        profileId: currentProfile.id,
        employeeId: currentEmployee.id,
      });
      // Xóa sạch hồ sơ & cache cục bộ sau khi xóa mẫu
      existingProfileRef.current = null;
      setFetchedProfile(null);
      setProfileDeletedLocally(true);
      setEngineHasPeriocularTemplate(false);
      setPeriocularUpgradedLocally(false);
      setNeedsPeriocularUpgrade(false);
      setEnrollThenPunch(false);
      enrollThenPunchRef.current = false;
      setRecoveryNotice('');
      setDeviceLabel(DEFAULT_DEVICE_LABEL);
      stopCameraAndLoop();
      onDeletedRef.current?.(res.faceProfiles);
      onCloseRef.current();
    } catch (err) {
      const msg =
        err instanceof FaceBiometricFlowError || err instanceof Error
          ? err.message
          : 'Không thể xóa mẫu khuôn mặt hiện tại. Vui lòng thử lại.';
      setSubmitError(msg);
      setConfirmingDelete(false);
    } finally {
      isDeletingRef.current = false;
      setIsDeleting(false);
    }
  }, [stopCameraAndLoop]);

  const livePct = metrics.liveness !== null ? Math.round(metrics.liveness * 100) : null;
  const realPct = metrics.antispoof !== null ? Math.round(metrics.antispoof * 100) : null;

  const isPeriocularMode = detectedPipeline === 'periocular';
  const hasPeriocularTemplate = Boolean(
    effectiveExistingProfile?.has_periocular_template ||
      periocularUpgradedLocally ||
      engineHasPeriocularTemplate
  );
  hasPeriocularTemplateRef.current = hasPeriocularTemplate;
  needsPeriocularUpgradeRef.current = needsPeriocularUpgrade;

  const facePassed = isPeriocularMode
    ? metrics.hasFace
    : metrics.hasFace && metrics.embeddingReady;
  const livenessPassed =
    metrics.liveness !== null && metrics.liveness >= THRESHOLD_LIVENESS;
  const antispoofPassed =
    metrics.antispoof !== null && metrics.antispoof >= THRESHOLD_ANTISPOOF;
  const blinkPassed = blinkCount >= THRESHOLD_BLINKS;

  const hasRecentQualifiedSnapshot = isPeriocularMode
    ? qualifiedPeriocularRef.current !== null &&
      Date.now() - qualifiedPeriocularRef.current.capturedAt <= SNAPSHOT_GRACE_MS
    : qualifiedFaceRef.current !== null &&
      Date.now() - qualifiedFaceRef.current.capturedAt <= SNAPSHOT_GRACE_MS;

  const enrollReady =
    (facePassed && livenessPassed && antispoofPassed) ||
    hasRecentQualifiedSnapshot;

  const hasLatchedReady = blinkPassed && hasRecentQualifiedSnapshot;

  const allChecksPassed =
    blinkPassed &&
    ((facePassed && livenessPassed && antispoofPassed) ||
      hasRecentQualifiedSnapshot);

  // Chỉ tự động xác thực ở chế độ chấm công (punch); chế độ Thiết lập (enroll) để người dùng chủ động bấm nút Lưu mẫu khuôn mặt
  useEffect(() => {
    const canAutoVerify =
      open &&
      activeMode === 'punch' &&
      phase === 'scanning' &&
      (allChecksPassed || hasLatchedReady) &&
      !submitError &&
      !autoSubmitPausedRef.current &&
      !autoSubmitTriggeredRef.current &&
      !isSubmittingRef.current;

    if (!canAutoVerify) {
      if (autoSubmitTimerRef.current !== null) {
        window.clearTimeout(autoSubmitTimerRef.current);
        autoSubmitTimerRef.current = null;
      }
      if (!isSubmittingRef.current) {
        setIsAutoVerifying(false);
      }
      return;
    }

    setIsAutoVerifying(true);
    autoSubmitTimerRef.current = window.setTimeout(() => {
      autoSubmitTimerRef.current = null;
      if (
        autoSubmitTriggeredRef.current ||
        autoSubmitPausedRef.current ||
        isSubmittingRef.current
      ) {
        return;
      }
      autoSubmitTriggeredRef.current = true;
      void handleSubmitPunchRef.current();
    }, AUTO_SUBMIT_STABLE_MS);

    return () => {
      if (autoSubmitTimerRef.current !== null) {
        window.clearTimeout(autoSubmitTimerRef.current);
        autoSubmitTimerRef.current = null;
      }
    };
  }, [
    open,
    activeMode,
    enrollThenPunch,
    phase,
    allChecksPassed,
    submitError,
  ]);

  if (!open) return null;

  const checklistItems = [
    {
      key: 'face',
      label: 'Nhận diện',
      shortLabel: 'Nhận diện',
      passed: facePassed,
      detail: facePassed
        ? 'Đạt'
        : metrics.hasFace
          ? 'Đang quét'
          : 'Chưa thấy',
    },
    {
      key: 'liveness',
      label: 'Liveness ≥ 50%',
      shortLabel: 'Live ≥50%',
      passed: livenessPassed,
      detail: livePct !== null ? `${livePct}%` : '--',
    },
    {
      key: 'antispoof',
      label: 'Chống giả mạo ≥ 50%',
      shortLabel: 'Real ≥50%',
      passed: antispoofPassed,
      detail: realPct !== null ? `${realPct}%` : '--',
    },
    {
      key: 'blink',
      label: 'Chớp mắt ≥ 1 lần',
      shortLabel: 'Chớp mắt ≥1',
      passed: blinkPassed,
      detail: `${blinkCount} lần`,
    },
  ];

  const isEnrollMode = activeMode === 'enroll';
  const isBusy = phase === 'submitting' || isDeleting;
  const resolvedPunchAction = 'Chấm công';
  const resolvedPunchLabel = punchActionLabel?.trim() || resolvedPunchAction;
  const modalTitle = isEnrollMode
    ? 'Thiết lập Khuôn mặt'
    : 'Chấm công bằng Khuôn mặt';
  const showLiveVideo =
    cameraReady &&
    (phase === 'loading' || phase === 'scanning' || phase === 'submitting');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[#11221E]/55 backdrop-blur-[2px] transition-opacity dark:bg-zinc-950/75"
        onClick={() => {
          if (!isSubmittingRef.current && !isDeletingRef.current) handleClose();
        }}
        aria-hidden="true"
      />

      {/* Dialog container — thiết kế gọn để toàn bộ camera + 4 tiêu chí + nút nằm trọn trong viewport */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="relative z-50 flex max-h-[94dvh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-[#C6D9D3] bg-[#FCFEFD] text-[#11221E] shadow-[0_16px_40px_rgba(17,34,30,0.2)] dark:border-zinc-800 dark:bg-[#121214] dark:text-zinc-100"
      >
        {/* Header gọn */}
        <div className="flex shrink-0 items-center justify-between gap-2.5 border-b border-[#C6D9D3] px-4 py-2.5 sm:px-5 sm:py-3 dark:border-zinc-800">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#0F766E]/12 text-[#0F766E] dark:bg-teal-500/15 dark:text-teal-300">
              <ScanFace className="h-4 w-4" strokeWidth={1.75} />
            </span>
            <div className="min-w-0">
              <h2
                id={titleId}
                className="truncate text-sm font-semibold leading-5 text-[#11221E] sm:text-base dark:text-zinc-100"
              >
                {modalTitle}
              </h2>
              <p
                id={descId}
                className="truncate text-[11px] leading-4 text-[#415A54] sm:text-xs dark:text-zinc-400"
              >
                {`${employee.full_name} (${employee.employee_code})`}
                {' · '}
                {isEnrollMode
                  ? 'Nhìn thẳng vào camera & bấm Lưu mẫu khuôn mặt'
                  : 'Đủ 4 tiêu chí Liveness sẽ tự động xác thực'}
              </p>
            </div>
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            disabled={isBusy}
            onClick={handleClose}
            aria-label="Đóng hộp thoại chấm công khuôn mặt"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[#415A54] transition-colors hover:bg-[#E4EEEB] hover:text-[#11221E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] disabled:pointer-events-none disabled:opacity-40 sm:h-9 sm:w-9 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            <X className="h-5 w-5 sm:h-4 sm:w-4" strokeWidth={1.75} />
          </button>
        </div>

        {/* Nội dung chính */}
        <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3 sm:px-5 sm:py-3.5">
          {/* Thanh trạng thái WiFi gọn */}
          {wifiStatus && phase !== 'success' && (
            <div
              className={`mb-2.5 flex items-center justify-between gap-2 rounded-xl border px-3 py-1.5 text-[11px] sm:text-xs ${
                wifiStatus.allowed
                  ? 'border-[#0F766E]/25 bg-[#E8F3EF] text-[#0B4F4A] dark:border-teal-500/30 dark:bg-teal-950/35 dark:text-teal-200'
                  : 'border-rose-500/30 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-950/40 dark:text-rose-200'
              }`}
            >
              <span className="inline-flex min-w-0 items-center gap-1.5 font-medium">
                {wifiStatus.allowed ? (
                  <Wifi className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                ) : (
                  <WifiOff className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                )}
                <span className="truncate">
                  {wifiStatus.allowed
                    ? isOpaqueNetworkMarker(wifiStatus.verifiedIp)
                      ? 'Đã xác thực kết nối WiFi'
                      : `WiFi hợp lệ (${wifiStatus.verifiedIp})`
                    : wifiStatus.reason}
                </span>
              </span>
              <span className="shrink-0 font-mono text-[11px] opacity-85">
                WiFi Nội bộ
              </span>
            </div>
          )}

          {/* Màn hình xác nhận THÀNH CÔNG nổi bật (camera đã tắt) */}
          {phase === 'success' && successSummary ? (
            <div
              role="status"
              aria-live="polite"
              className="flex flex-col items-center justify-center rounded-2xl border border-emerald-300 bg-emerald-50/90 px-4 py-6 text-center shadow-sm sm:px-6 sm:py-7 dark:border-emerald-800/70 dark:bg-emerald-950/35"
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-600 text-white shadow-md shadow-emerald-600/25 dark:bg-emerald-500">
                <CheckCircle2 className="h-10 w-10" strokeWidth={2} />
              </div>

              <h3 className="mt-4 text-lg font-bold tracking-tight text-emerald-950 sm:text-xl dark:text-emerald-100">
                {successSummary.kind === 'enroll'
                  ? 'Đã lưu mẫu khuôn mặt thành công!'
                  : 'Đã chấm công thành công!'}
              </h3>

              {successSummary.kind === 'enroll' ? (
                <div className="mt-3 w-full max-w-md space-y-2 rounded-xl border border-emerald-200/90 bg-white/95 p-3.5 text-left text-xs shadow-xs dark:border-emerald-900/60 dark:bg-zinc-900/85">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[#5C7871] dark:text-zinc-400">Nhân sự</span>
                    <span className="truncate font-semibold text-[#11221E] dark:text-zinc-100">
                      {employee.full_name} ({employee.employee_code})
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[#5C7871] dark:text-zinc-400">Thiết bị</span>
                    <span className="truncate font-medium text-[#11221E] dark:text-zinc-100">
                      {successSummary.deviceLabel}
                      {typeof successSummary.embeddingDim === 'number'
                        ? ` · ${successSummary.embeddingDim}D`
                        : ''}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[#5C7871] dark:text-zinc-400">Trạng thái</span>
                    <span className="font-medium text-[#11221E] dark:text-zinc-100">
                      {formatFaceCoverLabel(successSummary.faceCover)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[#5C7871] dark:text-zinc-400">WiFi hợp lệ</span>
                    <span className="font-mono font-medium text-emerald-700 dark:text-emerald-300">
                      {formatCleanWifiDisplay(
                        successSummary.wifiIp,
                        successSummary.wifiSsidLabel
                      )}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="mt-3 w-full max-w-md space-y-2 rounded-xl border border-emerald-200/90 bg-white/95 p-3.5 text-center shadow-xs dark:border-emerald-900/60 dark:bg-zinc-900/85">
                  <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
                    <span className="font-semibold text-[#11221E] dark:text-zinc-100">
                      {employee.full_name} ({employee.employee_code})
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                        successSummary.faceCover === 'mask'
                          ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-300'
                          : successSummary.faceCover === 'full_cover'
                            ? 'border-indigo-300 bg-indigo-50 text-indigo-800 dark:border-indigo-800/70 dark:bg-indigo-950/40 dark:text-indigo-300'
                            : 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800/70 dark:bg-emerald-950/40 dark:text-emerald-300'
                      }`}
                    >
                      {formatFaceCoverLabel(successSummary.faceCover)}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
                    {successSummary.kind === 'CHECK_OUT'
                      ? `Giờ vào ${successSummary.checkIn || '--:--'} — Giờ ra ${successSummary.checkOut || '--:--'} · Ghi nhận ${
                          typeof successSummary.workdayValue === 'number'
                            ? successSummary.workdayValue.toFixed(1)
                            : '--'
                        } công`
                      : `Giờ vào lúc ${successSummary.checkIn || '--:--'}${
                          successSummary.shiftCode
                            ? ` · Ca ${successSummary.shiftCode}`
                            : ''
                        }`}
                  </p>
                </div>
              )}

              <div className="mt-5 flex w-full max-w-md flex-col gap-2 sm:flex-row sm:justify-center">
                <button
                  type="button"
                  onClick={handleClose}
                  className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] sm:w-auto sm:min-w-[160px] dark:bg-emerald-600 dark:hover:bg-emerald-500"
                >
                  Hoàn tất
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              {/* Khung camera gọn aspect-[16/10] max-h-[220px] mobile / max-h-[250px] desktop — giữ sạch tự nhiên 100% */}
              <div className="overflow-hidden rounded-xl border border-[#C6D9D3] bg-zinc-950 shadow-sm dark:border-zinc-800">
                <div className="relative mx-auto aspect-[16/10] max-h-[220px] w-full max-w-[352px] sm:max-h-[250px] sm:max-w-[400px]">
                  <video
                    ref={videoRef}
                    muted
                    playsInline
                    className={`h-full w-full object-cover ${
                      showLiveVideo ? 'block' : 'hidden'
                    }`}
                  />
                  <canvas
                    ref={canvasRef}
                    className={`pointer-events-none absolute inset-0 h-full w-full object-cover ${
                      phase === 'scanning' || phase === 'submitting'
                        ? 'block'
                        : 'hidden'
                    }`}
                  />

                  {/* Loading khi chưa có camera */}
                  {phase === 'loading' && !cameraReady && (
                    <div className="flex h-full flex-col items-center justify-center gap-2.5 p-4 text-center text-zinc-200">
                      <Loader2 className="h-8 w-8 animate-spin text-teal-400" />
                      <div className="max-w-xs space-y-0.5">
                        <p className="text-sm font-semibold text-white">
                          Đang mở Camera &amp; AI Liveness
                        </p>
                        <p className="text-xs leading-4 text-zinc-300">
                          {loadingStep}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Badge overlay nhẹ khi camera đã lên hình nhưng model lần đầu đang tải */}
                  {phase === 'loading' && cameraReady && (
                    <div className="pointer-events-none absolute left-2.5 top-2.5 flex items-center gap-2 rounded-full bg-zinc-950/75 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-teal-400" />
                      <span>{loadingStep}</span>
                    </div>
                  )}

                  {/* Trạng thái lỗi fatal */}
                  {phase === 'error' && (
                    <div className="flex h-full flex-col items-center justify-center gap-2.5 p-4 text-center text-zinc-200">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-500/20 text-rose-400">
                        <AlertTriangle className="h-5 w-5" />
                      </div>
                      <div className="max-w-sm space-y-1">
                        <p className="text-sm font-semibold text-rose-200">
                          Không thể khởi chạy chấm công khuôn mặt
                        </p>
                        <p className="text-xs leading-4 text-zinc-300">
                          {fatalError}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void startCameraAndModel(true)}
                        className="mt-0.5 inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl bg-[#0F766E] px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-[#0D655E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Thử lại
                      </button>
                    </div>
                  )}

                  {/* Overlay đang gửi API */}
                  {phase === 'submitting' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-zinc-950/70 p-4 text-center text-white backdrop-blur-[2px]">
                      <Loader2 className="h-8 w-8 animate-spin text-teal-400" />
                      <p className="text-sm font-semibold">
                        {isEnrollMode
                          ? 'Đang mã hóa & lưu mẫu sinh trắc học...'
                          : 'Đủ điều kiện — Đang xác thực...'}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* 4 tiêu chí Liveness dạng lưới 2×2 gọn (ẩn khi bật chế độ Demo qua Copilot) */}
              {!hideLivenessPanel && (
                <div className="rounded-xl border border-[#C6D9D3] bg-[#F5FAF8] p-2.5 dark:border-zinc-800 dark:bg-zinc-900/60">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#0B4F4A] dark:text-teal-300">
                      <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                      <span>Kiểm tra Liveness trực tiếp</span>
                    </h3>
                    <div className="flex items-center gap-2">
                      <span className="hidden items-center gap-1 text-[11px] text-[#5C7871] sm:inline-flex dark:text-zinc-400">
                        <Eye className="h-3 w-3 text-[#0F766E] dark:text-teal-400" />
                        Nhìn thẳng &amp; chớp mắt 1 lần
                      </span>
                      {phase === 'scanning' && (
                        <button
                          type="button"
                          onClick={handleResetScan}
                          className="inline-flex min-h-[26px] items-center gap-1 rounded-md px-2 text-[11px] font-medium text-[#415A54] transition hover:bg-[#E4EEEB] hover:text-[#11221E] dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                        >
                          <RefreshCw className="h-3 w-3" />
                          Quét lại
                        </button>
                      )}
                    </div>
                  </div>

                  <ul
                    className="mt-2 grid grid-cols-2 gap-2"
                    aria-live="polite"
                  >
                    {checklistItems.map((item) => (
                      <li
                        key={item.key}
                        title={item.label}
                        className={`flex items-center justify-between gap-1.5 rounded-lg border px-2 py-1.5 text-[11px] transition-colors sm:px-2.5 sm:text-xs ${
                          item.passed
                            ? 'border-emerald-200 bg-emerald-50/90 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200'
                            : 'border-[#D5E3DF] bg-white text-[#415A54] dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-300'
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-1.5 font-medium">
                          {item.passed ? (
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5 shrink-0 text-zinc-400 dark:text-zinc-600" />
                          )}
                          <span className="truncate sm:hidden">{item.shortLabel}</span>
                          <span className="hidden truncate sm:inline">{item.label}</span>
                        </span>
                        <span className="shrink-0 font-mono text-[11px] font-semibold tabular-nums">
                          {item.detail}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Hướng dẫn ngắn khi tự phục hồi / đăng ký lại để chấm công luôn */}
              {isEnrollMode && enrollThenPunch && recoveryNotice && (
                <div
                  role="status"
                  className="flex items-start gap-2 rounded-xl border border-[#0F766E]/35 bg-[#E8F3EF] px-3 py-2 text-xs font-medium text-[#0B4F4A] dark:border-teal-700/60 dark:bg-teal-950/35 dark:text-teal-200"
                >
                  <ScanFace className="mt-0.5 h-4 w-4 shrink-0 text-[#0F766E] dark:text-teal-300" />
                  <p className="leading-4">{recoveryNotice}</p>
                </div>
              )}

              {/* Thông báo cập nhật thành công dữ liệu khuôn mặt */}
              {upgradeNotice && (
                <div
                  role="status"
                  className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-900 dark:border-emerald-800/70 dark:bg-emerald-950/35 dark:text-emerald-200"
                >
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span>{upgradeNotice}</span>
                </div>
              )}

              {/* Lỗi xác thực / đăng ký gọn sạch, khóa nút xác nhận khi có lỗi */}
              {submitError && (
                <div
                  role="alert"
                  className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200"
                >
                  <div className="flex min-w-0 items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
                    <p className="leading-4 sm:leading-5">{submitError}</p>
                  </div>
                </div>
              )}

              {/* Xác nhận xóa dữ liệu khuôn mặt hiện tại (chỉ Quản trị viên SUPER_ADMIN) */}
              {role === 'SUPER_ADMIN' &&
                effectiveExistingProfile &&
                confirmingDelete && (
                <div
                  role="alert"
                  className="rounded-xl border border-rose-200 bg-rose-50/90 p-2.5 text-xs text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="font-medium leading-4">
                      Xóa dữ liệu khuôn mặt <b>{effectiveExistingProfile.device_label}</b>? Sau khi xóa cần thiết lập lại mới chấm công được.
                    </p>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        disabled={isDeleting}
                        onClick={() => void handleDeleteExistingProfile()}
                        className="inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:opacity-60"
                      >
                        {isDeleting ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            <span>Đang xóa...</span>
                          </>
                        ) : (
                          <>
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>Xác nhận xóa</span>
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        disabled={isDeleting}
                        onClick={() => setConfirmingDelete(false)}
                        className="inline-flex min-h-[36px] items-center justify-center rounded-lg border border-rose-300 bg-white px-3 py-1 text-xs font-medium text-rose-800 transition hover:bg-rose-100 disabled:opacity-60 dark:border-rose-800 dark:bg-zinc-900 dark:text-rose-200 dark:hover:bg-rose-950/60"
                      >
                        Giữ lại
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Hàng nút hành động gọn gàng nằm ngay trong viewport */}
              <div className="flex flex-col-reverse gap-2 pt-0.5 sm:flex-row sm:items-center">
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={handleClose}
                  className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-[#C6D9D3] bg-white px-4 py-2 text-sm font-medium text-[#415A54] transition hover:bg-[#F2F7F5] hover:text-[#11221E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] disabled:pointer-events-none disabled:opacity-50 sm:w-auto sm:min-w-[100px] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                >
                  Đóng
                </button>

                {role === 'SUPER_ADMIN' &&
                  effectiveExistingProfile &&
                  !confirmingDelete && (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => {
                      setSubmitError('');
                      setConfirmingDelete(true);
                    }}
                    className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl border border-rose-500/45 bg-rose-50 px-3.5 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:pointer-events-none disabled:opacity-50 sm:w-auto dark:border-rose-500/40 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-900/50"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span>Xóa dữ liệu khuôn mặt</span>
                  </button>
                )}

                <button
                  type="button"
                  disabled={
                    phase !== 'scanning' ||
                    !(isEnrollMode ? enrollReady : allChecksPassed) ||
                    isDeleting ||
                    Boolean(submitError)
                  }
                  onClick={() => void handleSubmit()}
                  className="inline-flex min-h-[44px] w-full flex-1 items-center justify-center gap-2 rounded-xl bg-[#0F766E] px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-[#0F766E]/20 transition hover:bg-[#0D655E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-zinc-950"
                >
                  {phase === 'submitting' || isAutoVerifying ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>
                        {isEnrollMode
                          ? 'Đang lưu mẫu...'
                          : 'Đủ điều kiện — Đang xác thực...'}
                      </span>
                    </>
                  ) : (
                    <>
                      <Camera className="h-4 w-4" />
                      <span>
                        {isEnrollMode
                          ? enrollThenPunch
                            ? 'Lưu mẫu khuôn mặt & chấm công'
                            : 'Lưu mẫu khuôn mặt'
                          : 'Xác nhận chấm công'}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default FaceLivenessAttendanceModal;
