from __future__ import annotations

import base64
import binascii
import logging
import math
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Optional

import cv2
import numpy as np
import onnxruntime as ort
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

logger = logging.getLogger("hrm-periocular-onnx")
logging.basicConfig(level=logging.WARNING, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

BASE_DIR = Path(__file__).resolve().parents[2]
MODEL_DIR = BASE_DIR / "models" / "periocular-onnx"
DET_MODEL_PATH = MODEL_DIR / "det_500m.onnx"
REC_MODEL_PATH = MODEL_DIR / "w600k_mbf.onnx"

MAX_FRAME_BYTES = 1_468_006  # ~1.4 MiB decoded ceiling
MAX_B64_CHARS = 2_100_000
MAX_IMAGE_DIM = 4096
MIN_IMAGE_DIM = 48

# Standard ArcFace 112x112 5-point reference coordinates (left_eye, right_eye, nose, mouth_l, mouth_r)
ARCFACE_DST = np.array(
    [
        [38.2946, 51.6963],
        [73.5318, 51.5014],
        [56.0252, 71.7366],
        [41.5493, 92.3655],
        [70.7299, 92.2041],
    ],
    dtype=np.float32,
)

# Relative proportions from (left_eye, right_eye) to (nose, mouth_l, mouth_r) in ARCFACE_DST frame
_EYE_VEC = ARCFACE_DST[1] - ARCFACE_DST[0]
_EYE_DIST_REF = float(np.hypot(_EYE_VEC[0], _EYE_VEC[1]))
_EYE_U_REF = _EYE_VEC / _EYE_DIST_REF
_EYE_N_REF = np.array([-_EYE_U_REF[1], _EYE_U_REF[0]], dtype=np.float32)
_EYE_MID_REF = 0.5 * (ARCFACE_DST[0] + ARCFACE_DST[1])


def _rel_coeffs(pt: np.ndarray) -> tuple[float, float]:
    delta = pt - _EYE_MID_REF
    return (
        float(np.dot(delta, _EYE_U_REF) / _EYE_DIST_REF),
        float(np.dot(delta, _EYE_N_REF) / _EYE_DIST_REF),
    )


_NOSE_REL = _rel_coeffs(ARCFACE_DST[2])
_MOUTHL_REL = _rel_coeffs(ARCFACE_DST[3])
_MOUTHR_REL = _rel_coeffs(ARCFACE_DST[4])

DEFAULT_GUIDE_BOX = {"x": 0.08, "y": 0.10, "w": 0.84, "h": 0.72}


class ExtractRequest(BaseModel):
    frame_b64: str = Field(..., min_length=16, max_length=MAX_B64_CHARS)
    aux_frame_b64: Optional[str] = Field(default=None, max_length=MAX_B64_CHARS)
    mode: str = Field(default="auto")
    guide_box: Optional[dict[str, float]] = Field(default_factory=lambda: dict(DEFAULT_GUIDE_BOX))
    require_blink: bool = Field(default=False)


class MaskCheckRequest(BaseModel):
    frame_b64: str = Field(..., min_length=16, max_length=MAX_B64_CHARS)
    guide_box: Optional[dict[str, float]] = Field(default=None)


class PeriocularEngine:
    """In-memory ONNX + Haar-cascade engine for mask/balaclava-resilient periocular extraction."""

    def __init__(self) -> None:
        self.det_session: Optional[ort.InferenceSession] = None
        self.rec_session: Optional[ort.InferenceSession] = None
        self.det_input_name: str = "input.1"
        self.rec_input_name: str = "input.1"
        self.eye_cascade: Optional[cv2.CascadeClassifier] = None
        self.eye_glasses_cascade: Optional[cv2.CascadeClassifier] = None
        self.anchor_cache: dict[tuple[int, int, int], np.ndarray] = {}
        self.ready: bool = False

    def load(self) -> None:
        if not DET_MODEL_PATH.is_file() or not REC_MODEL_PATH.is_file():
            raise FileNotFoundError(f"Missing ONNX models in {MODEL_DIR}")

        sess_opts = ort.SessionOptions()
        sess_opts.inter_op_num_threads = 1
        sess_opts.intra_op_num_threads = 2

        self.det_session = ort.InferenceSession(
            str(DET_MODEL_PATH), sess_options=sess_opts, providers=["CPUExecutionProvider"]
        )
        self.rec_session = ort.InferenceSession(
            str(REC_MODEL_PATH), sess_options=sess_opts, providers=["CPUExecutionProvider"]
        )
        self.det_input_name = self.det_session.get_inputs()[0].name
        self.rec_input_name = self.rec_session.get_inputs()[0].name

        haar_dir = Path(cv2.data.haarcascades)
        eye_xml = haar_dir / "haarcascade_eye.xml"
        glasses_xml = haar_dir / "haarcascade_eye_tree_eyeglasses.xml"
        self.eye_cascade = cv2.CascadeClassifier(str(eye_xml))
        self.eye_glasses_cascade = cv2.CascadeClassifier(str(glasses_xml))
        if self.eye_cascade.empty() or self.eye_glasses_cascade.empty():
            raise RuntimeError("Failed to load OpenCV eye Haar cascades")

        self.ready = True

    def _get_anchors(self, height: int, width: int, stride: int, num_anchors: int = 2) -> np.ndarray:
        key = (height, width, stride)
        cached = self.anchor_cache.get(key)
        if cached is not None:
            return cached
        centers = np.stack(np.mgrid[:height, :width][::-1], axis=-1).astype(np.float32)
        centers = (centers * stride).reshape((-1, 2))
        if num_anchors > 1:
            centers = np.stack([centers] * num_anchors, axis=1).reshape((-1, 2))
        self.anchor_cache[key] = centers
        return centers

    @staticmethod
    def _nms(dets: np.ndarray, iou_thresh: float = 0.4) -> list[int]:
        if len(dets) == 0:
            return []
        x1 = dets[:, 0]
        y1 = dets[:, 1]
        x2 = dets[:, 2]
        y2 = dets[:, 3]
        scores = dets[:, 4]
        areas = np.maximum(0.0, x2 - x1 + 1.0) * np.maximum(0.0, y2 - y1 + 1.0)
        order = scores.argsort()[::-1]
        keep: list[int] = []
        while order.size > 0:
            i = int(order[0])
            keep.append(i)
            xx1 = np.maximum(x1[i], x1[order[1:]])
            yy1 = np.maximum(y1[i], y1[order[1:]])
            xx2 = np.minimum(x2[i], x2[order[1:]])
            yy2 = np.minimum(y2[i], y2[order[1:]])
            w = np.maximum(0.0, xx2 - xx1 + 1.0)
            h = np.maximum(0.0, yy2 - yy1 + 1.0)
            inter = w * h
            ovr = inter / np.maximum(areas[i] + areas[order[1:]] - inter, 1e-6)
            inds = np.where(ovr <= iou_thresh)[0]
            order = order[inds + 1]
        return keep

    def _run_scrfd(self, bgr: np.ndarray, thresh: float = 0.30) -> Optional[tuple[np.ndarray, float, np.ndarray]]:
        assert self.det_session is not None
        input_size = 640
        img_h, img_w = bgr.shape[:2]
        im_ratio = float(img_h) / float(img_w)
        if im_ratio > 1.0:
            new_height = input_size
            new_width = max(1, int(new_height / im_ratio))
        else:
            new_width = input_size
            new_height = max(1, int(new_width * im_ratio))
        det_scale = float(new_height) / float(img_h)
        resized = cv2.resize(bgr, (new_width, new_height))
        det_img = np.zeros((input_size, input_size, 3), dtype=np.uint8)
        det_img[:new_height, :new_width, :] = resized

        blob = cv2.dnn.blobFromImage(
            det_img, 1.0 / 128.0, (input_size, input_size), (127.5, 127.5, 127.5), swapRB=True
        )
        outputs = self.det_session.run(None, {self.det_input_name: blob})

        fmc = 3
        strides = (8, 16, 32)
        num_anchors = 2
        scores_list: list[np.ndarray] = []
        bboxes_list: list[np.ndarray] = []
        kpss_list: list[np.ndarray] = []

        for idx, stride in enumerate(strides):
            scores = outputs[idx].reshape(-1)
            bbox_preds = outputs[idx + fmc] * stride
            kps_preds = outputs[idx + fmc * 2] * stride
            fm_h = input_size // stride
            fm_w = input_size // stride
            anchors = self._get_anchors(fm_h, fm_w, stride, num_anchors)

            pos_inds = np.where(scores >= thresh)[0]
            if pos_inds.size == 0:
                continue

            pos_anchors = anchors[pos_inds]
            pos_bbox = bbox_preds[pos_inds]
            pos_kps = kps_preds[pos_inds]

            bboxes = np.stack(
                [
                    pos_anchors[:, 0] - pos_bbox[:, 0],
                    pos_anchors[:, 1] - pos_bbox[:, 1],
                    pos_anchors[:, 0] + pos_bbox[:, 2],
                    pos_anchors[:, 1] + pos_bbox[:, 3],
                ],
                axis=-1,
            )
            kpss = np.empty((pos_inds.size, 5, 2), dtype=np.float32)
            for k in range(5):
                kpss[:, k, 0] = pos_anchors[:, 0] + pos_kps[:, 2 * k]
                kpss[:, k, 1] = pos_anchors[:, 1] + pos_kps[:, 2 * k + 1]

            scores_list.append(scores[pos_inds])
            bboxes_list.append(bboxes / det_scale)
            kpss_list.append(kpss / det_scale)

        if not scores_list:
            return None

        all_scores = np.concatenate(scores_list, axis=0)
        all_bboxes = np.vstack(bboxes_list)
        all_kpss = np.vstack(kpss_list)

        dets = np.hstack([all_bboxes, all_scores[:, None]]).astype(np.float32)
        keep = self._nms(dets, iou_thresh=0.4)
        if not keep:
            return None

        # Choose primary face by score weighted slightly toward larger central faces
        best_idx = keep[0]
        best_rank = -1.0
        cx_img, cy_img = img_w * 0.5, img_h * 0.5
        diag = math.hypot(img_w, img_h)
        for idx in keep:
            bx1, by1, bx2, by2, sc = dets[idx]
            bw = max(1.0, float(bx2 - bx1))
            bh = max(1.0, float(by2 - by1))
            area_factor = min(1.0, math.sqrt(bw * bh) / (0.18 * min(img_w, img_h)))
            fcx = 0.5 * (bx1 + bx2)
            fcy = 0.5 * (by1 + by2)
            center_dist = math.hypot(fcx - cx_img, fcy - cy_img) / max(diag, 1.0)
            rank = float(sc) * (0.75 + 0.25 * area_factor) - 0.15 * center_dist
            if rank > best_rank:
                best_rank = rank
                best_idx = idx

        kps = all_kpss[best_idx]
        # Ensure viewer-left eye is index 0 and viewer-right eye is index 1
        if kps[0, 0] > kps[1, 0]:
            kps[[0, 1]] = kps[[1, 0]]
            kps[[3, 4]] = kps[[4, 3]]
        return dets[best_idx, :4], float(dets[best_idx, 4]), kps

    @staticmethod
    def _assess_face_cover(
        bgr: np.ndarray,
        kps: np.ndarray,
        orig_score: float,
        neutral_score: Optional[float],
        neutralized_only: bool,
        detection_mode: str,
    ) -> tuple[bool, float, str]:
        """Compute mask_occluded, mask_score [0..1], and face_cover ('none'|'mask'|'full_cover')."""
        h, w = bgr.shape[:2]
        left_eye, right_eye = kps[0], kps[1]
        eye_dist = float(np.hypot(right_eye[0] - left_eye[0], right_eye[1] - left_eye[1]))
        if eye_dist < 8.0:
            is_occ = neutralized_only or detection_mode == "eyepair_periocular"
            return is_occ, (0.85 if is_occ else 0.0), ("full_cover" if detection_mode == "eyepair_periocular" else ("mask" if is_occ else "none"))

        mid_eye = 0.5 * (left_eye + right_eye)
        # Upper nasal-bridge skin reference between/just below inner eye corners
        ux1 = max(0, int(mid_eye[0] - 0.24 * eye_dist))
        ux2 = min(w, int(mid_eye[0] + 0.24 * eye_dist))
        uy1 = max(0, int(mid_eye[1] - 0.04 * eye_dist))
        uy2 = min(h, max(uy1 + 4, int(mid_eye[1] + 0.22 * eye_dist)))

        # Forehead patch (to detect balaclava/full_cover vs half mask)
        fx1 = max(0, int(mid_eye[0] - 0.48 * eye_dist))
        fx2 = min(w, int(mid_eye[0] + 0.48 * eye_dist))
        fy1 = max(0, int(mid_eye[1] - 0.78 * eye_dist))
        fy2 = min(h, max(fy1 + 4, int(mid_eye[1] - 0.36 * eye_dist)))

        # Nose-mouth occlusion patch derived geometrically from 2 eyes
        lx1 = max(0, int(mid_eye[0] - 0.50 * eye_dist))
        lx2 = min(w, int(mid_eye[0] + 0.50 * eye_dist))
        ly1 = max(0, int(mid_eye[1] + 0.52 * eye_dist))
        ly2 = min(h, max(ly1 + 6, int(mid_eye[1] + 1.32 * eye_dist)))

        # Nose-bridge horizontal border band (where mask top edge crosses face)
        bx1 = max(0, int(mid_eye[0] - 0.52 * eye_dist))
        bx2 = min(w, int(mid_eye[0] + 0.52 * eye_dist))
        by1 = max(0, int(mid_eye[1] + 0.30 * eye_dist))
        by2 = min(h, max(by1 + 6, int(mid_eye[1] + 0.74 * eye_dist)))

        lower_skin_ratio = 1.0
        forehead_skin_ratio = 1.0
        temple_skin_ratio = 1.0
        chroma_shift = 0.0
        luma_shift = 0.0
        edge_signal = 0.0

        if ux2 - ux1 >= 6 and uy2 - uy1 >= 4 and lx2 - lx1 >= 6 and ly2 - ly1 >= 6:
            upper_patch = bgr[uy1:uy2, ux1:ux2]
            lower_patch = bgr[ly1:ly2, lx1:lx2]
            upper_ycrcb = cv2.cvtColor(upper_patch, cv2.COLOR_BGR2YCrCb)
            lower_ycrcb = cv2.cvtColor(lower_patch, cv2.COLOR_BGR2YCrCb)

            u_med = np.median(upper_ycrcb.reshape(-1, 3), axis=0)
            l_med = np.median(lower_ycrcb.reshape(-1, 3), axis=0)
            u_is_skin = bool(
                float(u_med[0]) >= 38.0
                and 131.0 <= float(u_med[1]) <= 180.0
                and 73.0 <= float(u_med[2]) <= 130.0
                and (float(u_med[1]) - float(u_med[2])) >= 6.0
            )
            chroma_shift = float(math.hypot(float(l_med[1] - u_med[1]), float(l_med[2] - u_med[2])))
            luma_shift = float(abs(float(l_med[0]) - float(u_med[0])))

            ly_arr = lower_ycrcb[:, :, 0].astype(np.float32)
            cr = lower_ycrcb[:, :, 1].astype(np.float32)
            cb = lower_ycrcb[:, :, 2].astype(np.float32)
            abs_skin = (ly_arr >= 38.0) & (cr >= 131.0) & (cr <= 180.0) & (cb >= 73.0) & (cb <= 130.0) & ((cr - cb) >= 6.0)
            if u_is_skin:
                rel_skin = (
                    (np.abs(cr - float(u_med[1])) <= 20.0)
                    & (np.abs(cb - float(u_med[2])) <= 20.0)
                    & (np.abs(ly_arr - float(u_med[0])) <= 65.0)
                )
                lower_skin_ratio = float(np.mean(abs_skin | rel_skin))
            else:
                lower_skin_ratio = float(np.mean(abs_skin))

            # Texture / smoothness in lower patch vs upper eye-cheek patch
            lower_gray = cv2.cvtColor(lower_patch, cv2.COLOR_BGR2GRAY)
            lower_std = float(np.std(lower_gray))
            smooth_score = float(np.clip((26.0 - lower_std) / 20.0, 0.0, 1.0))

            border_score = 0.0
            if bx2 - bx1 >= 8 and by2 - by1 >= 6:
                bridge_gray = cv2.cvtColor(bgr[by1:by2, bx1:bx2], cv2.COLOR_BGR2GRAY)
                gx_map = np.abs(cv2.Sobel(bridge_gray, cv2.CV_32F, 1, 0, ksize=3))
                gy_map = np.abs(cv2.Sobel(bridge_gray, cv2.CV_32F, 0, 1, ksize=3))
                row_gy = np.mean(gy_map, axis=1)
                peak_row_gy = float(np.max(row_gy)) if row_gy.size > 0 else 0.0
                mean_gx = float(np.mean(gx_map))
                ratio_edge = peak_row_gy / max(mean_gx + 6.0, 1.0)
                border_score = float(np.clip((ratio_edge - 1.25) / 2.2, 0.0, 1.0)) * float(
                    np.clip((peak_row_gy - 12.0) / 35.0, 0.0, 1.0)
                )

            edge_signal = float(np.clip(0.60 * border_score + 0.40 * smooth_score, 0.0, 1.0))

            if fx2 - fx1 >= 6 and fy2 - fy1 >= 4:
                fh_ycrcb = cv2.cvtColor(bgr[fy1:fy2, fx1:fx2], cv2.COLOR_BGR2YCrCb)
                f_y = fh_ycrcb[:, :, 0].astype(np.float32)
                f_cr = fh_ycrcb[:, :, 1].astype(np.float32)
                f_cb = fh_ycrcb[:, :, 2].astype(np.float32)
                fh_abs = (f_y >= 42.0) & (f_cr >= 133.0) & (f_cr <= 178.0) & (f_cb >= 74.0) & (f_cb <= 128.0) & ((f_cr - f_cb) >= 8.0)
                if u_is_skin:
                    fh_rel = (
                        (np.abs(f_cr - float(u_med[1])) <= 18.0)
                        & (np.abs(f_cb - float(u_med[2])) <= 18.0)
                        & (np.abs(f_y - float(u_med[0])) <= 55.0)
                    )
                    forehead_skin_ratio = float(np.mean(fh_abs | fh_rel))
                else:
                    forehead_skin_ratio = float(np.mean(fh_abs))

            # Outer temples / sides beyond eye corners (bare in half-mask, covered in balaclava/full_cover)
            temple_ratios: list[float] = []
            ty1 = max(0, int(mid_eye[1] - 0.12 * eye_dist))
            ty2 = min(h, max(ty1 + 4, int(mid_eye[1] + 0.28 * eye_dist)))
            for tx1, tx2 in (
                (max(0, int(left_eye[0] - 0.72 * eye_dist)), max(0, int(left_eye[0] - 0.42 * eye_dist))),
                (min(w, int(right_eye[0] + 0.42 * eye_dist)), min(w, int(right_eye[0] + 0.72 * eye_dist))),
            ):
                if tx2 - tx1 >= 5 and ty2 - ty1 >= 4:
                    t_ycrcb = cv2.cvtColor(bgr[ty1:ty2, tx1:tx2], cv2.COLOR_BGR2YCrCb)
                    t_y = t_ycrcb[:, :, 0].astype(np.float32)
                    t_cr = t_ycrcb[:, :, 1].astype(np.float32)
                    t_cb = t_ycrcb[:, :, 2].astype(np.float32)
                    t_abs = (t_y >= 42.0) & (t_cr >= 133.0) & (t_cr <= 178.0) & (t_cb >= 74.0) & (t_cb <= 128.0) & ((t_cr - t_cb) >= 8.0)
                    if u_is_skin:
                        t_rel = (
                            (np.abs(t_cr - float(u_med[1])) <= 18.0)
                            & (np.abs(t_cb - float(u_med[2])) <= 18.0)
                            & (np.abs(t_y - float(u_med[0])) <= 55.0)
                        )
                        temple_ratios.append(float(np.mean(t_abs | t_rel)))
                    else:
                        temple_ratios.append(float(np.mean(t_abs)))
            if temple_ratios:
                temple_skin_ratio = float(np.mean(temple_ratios))

        # SCRFD confidence signal (orig vs lower-half-neutralized)
        if detection_mode == "eyepair_periocular" or neutralized_only:
            scrfd_signal = 1.0
        else:
            base_drop = float(np.clip((0.78 - orig_score) / 0.45, 0.0, 1.0))
            if neutral_score is not None and neutral_score > orig_score:
                boost = float(np.clip((neutral_score - orig_score) / 0.25, 0.0, 1.0))
                scrfd_signal = float(np.clip(0.55 * base_drop + 0.45 * boost, 0.0, 1.0))
            else:
                scrfd_signal = base_drop

        skin_occ = float(np.clip((0.58 - lower_skin_ratio) / 0.42, 0.0, 1.0))
        color_occ = float(np.clip((chroma_shift - 9.0) / 20.0, 0.0, 1.0))
        luma_occ = float(np.clip((luma_shift - 26.0) / 52.0, 0.0, 1.0))
        skin_signal = max(skin_occ, 0.65 * color_occ + 0.35 * luma_occ)

        mask_score = float(np.clip(0.30 * scrfd_signal + 0.48 * skin_signal + 0.22 * edge_signal, 0.0, 1.0))
        if neutralized_only or detection_mode == "eyepair_periocular":
            mask_score = max(mask_score, 0.78)
        elif lower_skin_ratio < 0.28 and orig_score < 0.75 and (chroma_shift > 14.0 or luma_shift > 50.0):
            mask_score = max(mask_score, 0.62)

        mask_score = round(mask_score, 4)
        mask_occluded = bool(mask_score >= 0.48 or neutralized_only or detection_mode == "eyepair_periocular")

        if not mask_occluded:
            face_cover = "none"
        elif forehead_skin_ratio < 0.28 and temple_skin_ratio < 0.32:
            face_cover = "full_cover"
        else:
            face_cover = "mask"

        return mask_occluded, mask_score, face_cover

    def detect_tier1_scrfd(self, bgr: np.ndarray, check_neutral_boost: bool = True) -> Optional[dict[str, Any]]:
        res = self._run_scrfd(bgr, thresh=0.30)
        neutralized_only = False
        orig_score = 0.0
        neutral_score: Optional[float] = None

        if res is None:
            h = bgr.shape[0]
            for cut_ratio in (0.58, 0.70):
                neutral_bgr = bgr.copy()
                neutral_bgr[int(cut_ratio * h) :, :, :] = 128
                res = self._run_scrfd(neutral_bgr, thresh=0.30)
                if res is not None:
                    break
            if res is None:
                return None
            neutralized_only = True
            neutral_score = float(res[1])
        else:
            orig_score = float(res[1])
            if check_neutral_boost and orig_score < 0.72:
                h = bgr.shape[0]
                neutral_bgr = bgr.copy()
                neutral_bgr[int(0.58 * h) :, :, :] = 128
                n_res = self._run_scrfd(neutral_bgr, thresh=0.30)
                if n_res is not None:
                    neutral_score = float(n_res[1])

        _, det_score, kps = res
        mask_occluded, mask_score, face_cover = self._assess_face_cover(
            bgr, kps, orig_score, neutral_score, neutralized_only, "scrfd_masked"
        )
        return {
            "detection_mode": "scrfd_masked",
            "mask_occluded": mask_occluded,
            "mask_score": mask_score,
            "face_cover": face_cover,
            "det_score": det_score,
            "kps5": kps,
        }

    @staticmethod
    def _derive_kps5_from_eyes(left_eye: np.ndarray, right_eye: np.ndarray) -> np.ndarray:
        vec = right_eye - left_eye
        dist = float(np.hypot(vec[0], vec[1]))
        u = vec / max(dist, 1e-6)
        n = np.array([-u[1], u[0]], dtype=np.float32)
        mid = 0.5 * (left_eye + right_eye)
        nose = mid + (_NOSE_REL[0] * u + _NOSE_REL[1] * n) * dist
        mouth_l = mid + (_MOUTHL_REL[0] * u + _MOUTHL_REL[1] * n) * dist
        mouth_r = mid + (_MOUTHR_REL[0] * u + _MOUTHR_REL[1] * n) * dist
        return np.stack([left_eye, right_eye, nose, mouth_l, mouth_r], axis=0).astype(np.float32)

    def detect_tier2_eyepair(
        self, bgr: np.ndarray, guide_box: Optional[dict[str, float]] = None
    ) -> Optional[dict[str, Any]]:
        assert self.eye_cascade is not None and self.eye_glasses_cascade is not None
        img_h, img_w = bgr.shape[:2]

        if guide_box is None:
            gx0, gx1, gy0, gy1 = 0.08, 0.92, 0.10, 0.82
        else:
            gx = float(guide_box.get("x", DEFAULT_GUIDE_BOX["x"]))
            gy = float(guide_box.get("y", DEFAULT_GUIDE_BOX["y"]))
            gw = float(guide_box.get("w", DEFAULT_GUIDE_BOX["w"]))
            gh = float(guide_box.get("h", DEFAULT_GUIDE_BOX["h"]))
            gx0 = max(0.0, gx - 0.03)
            gy0 = max(0.0, gy - 0.05)
            gx1 = min(1.0, gx + gw + 0.03)
            gy1 = min(1.0, gy + gh + 0.06)

        rx1 = max(0, int(gx0 * img_w))
        ry1 = max(0, int(gy0 * img_h))
        rx2 = min(img_w, int(gx1 * img_w))
        ry2 = min(img_h, int(gy1 * img_h))
        if rx2 - rx1 < 32 or ry2 - ry1 < 24:
            return None

        roi_gray = cv2.cvtColor(bgr[ry1:ry2, rx1:rx2], cv2.COLOR_BGR2GRAY)
        roi_w = rx2 - rx1
        roi_scale = 1.0
        if roi_w > 240:
            roi_scale = 240.0 / float(roi_w)
            roi_work = cv2.resize(
                roi_gray,
                (max(32, int(round(roi_w * roi_scale))), max(24, int(round((ry2 - ry1) * roi_scale)))),
                interpolation=cv2.INTER_AREA,
            )
        else:
            roi_work = roi_gray

        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        roi_eq = clahe.apply(roi_work)

        min_eye = max(14, int(min(img_w, img_h) * 0.05 * roi_scale))
        max_eye = max(min_eye + 8, int(min(img_w, img_h) * 0.35 * roi_scale))

        raw_boxes: list[tuple[int, int, int, int, float]] = []
        for cascade, base_w, min_nbr in (
            (self.eye_cascade, 1.0, 2),
            (self.eye_glasses_cascade, 0.92, 2),
        ):
            found = cascade.detectMultiScale(
                roi_eq,
                scaleFactor=1.12,
                minNeighbors=min_nbr,
                minSize=(min_eye, min_eye),
                maxSize=(max_eye, max_eye),
            )
            if len(found) > 0:
                for ex, ey, ew, eh in found:
                    inv = 1.0 / roi_scale
                    raw_boxes.append(
                        (int(round(ex * inv)), int(round(ey * inv)), int(round(ew * inv)), int(round(eh * inv)), base_w)
                    )
            if len(raw_boxes) >= 2:
                break

        if len(raw_boxes) < 2:
            return None

        # Filter eye candidates by real-eye edge variance and contrast
        valid_candidates: list[dict[str, float]] = []
        for ex, ey, ew, eh, base_w in raw_boxes:
            patch = roi_gray[ey : ey + eh, ex : ex + ew]
            if patch.size == 0:
                continue
            lap_var = float(cv2.Laplacian(patch, cv2.CV_64F).var())
            std_val = float(np.std(patch))
            if lap_var < 20.0 or std_val < 10.0:
                continue
            cx = rx1 + ex + 0.5 * ew
            cy = ry1 + ey + 0.5 * eh
            quality = base_w * min(1.0, std_val / 38.0) * min(1.0, lap_var / 120.0)
            valid_candidates.append(
                {
                    "cx": cx,
                    "cy": cy,
                    "w": float(ew),
                    "h": float(eh),
                    "quality": quality,
                    "lap_var": lap_var,
                    "std": std_val,
                }
            )

        if len(valid_candidates) < 2:
            return None

        # Deduplicate overlapping detections keeping highest quality
        valid_candidates.sort(key=lambda c: c["quality"], reverse=True)
        deduped: list[dict[str, float]] = []
        min_sep = max(12.0, 0.055 * img_w)
        for cand in valid_candidates:
            if any(math.hypot(cand["cx"] - d["cx"], cand["cy"] - d["cy"]) < min_sep for d in deduped):
                continue
            deduped.append(cand)

        if len(deduped) < 2:
            return None

        best_pair: Optional[tuple[dict[str, float], dict[str, float], float]] = None
        roi_cx = 0.5 * (rx1 + rx2)
        roi_cy = 0.5 * (ry1 + ry2)
        roi_diag = max(1.0, math.hypot(rx2 - rx1, ry2 - ry1))

        for i in range(len(deduped)):
            for j in range(i + 1, len(deduped)):
                a, b = deduped[i], deduped[j]
                left, right = (a, b) if a["cx"] < b["cx"] else (b, a)
                dx = right["cx"] - left["cx"]
                dy = right["cy"] - left["cy"]
                if not (0.14 * img_w <= dx <= 0.55 * img_w):
                    continue
                if abs(dy) > 0.28 * dx:
                    continue
                size_ratio = min(left["w"], right["w"]) / max(left["w"], right["w"], 1.0)
                if size_ratio < 0.55:
                    continue

                tilt_penalty = abs(dy) / max(dx, 1.0)
                mid_x = 0.5 * (left["cx"] + right["cx"])
                mid_y = 0.5 * (left["cy"] + right["cy"])
                center_dist = math.hypot(mid_x - roi_cx, mid_y - roi_cy) / roi_diag
                pair_score = (
                    0.45 * (left["quality"] + right["quality"]) * 0.5
                    + 0.30 * size_ratio
                    + 0.25 * max(0.0, 1.0 - tilt_penalty * 2.5)
                    - 0.20 * center_dist
                )
                if best_pair is None or pair_score > best_pair[2]:
                    best_pair = (left, right, pair_score)

        if best_pair is None:
            return None

        left, right, pair_score = best_pair
        left_pt = np.array([left["cx"], left["cy"]], dtype=np.float32)
        right_pt = np.array([right["cx"], right["cy"]], dtype=np.float32)
        kps5 = self._derive_kps5_from_eyes(left_pt, right_pt)
        det_score = float(np.clip(0.45 + 0.45 * pair_score, 0.35, 0.92))
        mask_occluded, mask_score, face_cover = self._assess_face_cover(
            bgr, kps5, 0.0, None, False, "eyepair_periocular"
        )
        return {
            "detection_mode": "eyepair_periocular",
            "mask_occluded": mask_occluded,
            "mask_score": mask_score,
            "face_cover": face_cover,
            "det_score": det_score,
            "kps5": kps5,
        }

    @staticmethod
    def _two_point_similarity(src0: np.ndarray, src1: np.ndarray, dst0: np.ndarray, dst1: np.ndarray) -> np.ndarray:
        vx = float(src1[0] - src0[0])
        vy = float(src1[1] - src0[1])
        dist_src = math.hypot(vx, vy)
        dx = float(dst1[0] - dst0[0])
        dy = float(dst1[1] - dst0[1])
        dist_dst = math.hypot(dx, dy)
        scale = dist_dst / max(dist_src, 1e-6)

        ang_src = math.atan2(vy, vx)
        ang_dst = math.atan2(dy, dx)
        theta = ang_dst - ang_src
        a = scale * math.cos(theta)
        b = scale * math.sin(theta)
        # Rotation by +theta in image coords (x right, y down):
        # x' = a*x - b*y + tx, y' = b*x + a*y + ty
        tx = float(dst0[0]) - (a * float(src0[0]) - b * float(src0[1]))
        ty = float(dst0[1]) - (b * float(src0[0]) + a * float(src0[1]))
        return np.array([[a, -b, tx], [b, a, ty]], dtype=np.float32)

    def _warp_slit_112(
        self,
        bgr: np.ndarray,
        left_eye: np.ndarray,
        right_eye: np.ndarray,
        dst_l: tuple[float, float],
        dst_r: tuple[float, float],
        y0: int,
        y1: int,
        x0: int,
        x1: int,
    ) -> np.ndarray:
        M = self._two_point_similarity(
            left_eye,
            right_eye,
            np.array(dst_l, dtype=np.float32),
            np.array(dst_r, dtype=np.float32),
        )
        warped = cv2.warpAffine(bgr, M, (112, 112), flags=cv2.INTER_LINEAR, borderValue=(127, 127, 127))
        rgb = cv2.cvtColor(warped, cv2.COLOR_BGR2RGB).astype(np.float32)
        slit = rgb[y0:y1, x0:x1]
        mean_val = float(slit.mean())
        std_val = max(float(slit.std()), 18.0) * 2.2
        norm = np.clip((rgb - mean_val) / std_val, -1.0, 1.0)
        norm[:y0, :, :] = 0.0
        norm[y1:, :, :] = 0.0
        norm[:, :x0, :] = 0.0
        norm[:, x1:, :] = 0.0
        return np.transpose(norm, (2, 0, 1))[None, ...].astype(np.float32)

    @staticmethod
    def _l2_norm(vec: np.ndarray) -> np.ndarray:
        norm = float(np.linalg.norm(vec))
        if norm < 1e-12:
            return vec
        return vec / norm

    def extract_embedding(self, bgr: np.ndarray, kps5: np.ndarray) -> list[float]:
        assert self.rec_session is not None
        left_eye, right_eye = kps5[0], kps5[1]
        # Crop 1 (zoom_slit): eye slit y=34..68, x=8..104
        crop1 = self._warp_slit_112(bgr, left_eye, right_eye, (34.0, 54.0), (78.0, 54.0), 34, 68, 8, 104)
        # Crop 2 (arc_slit): tighter eye slit y=34..58, x=10..102
        crop2 = self._warp_slit_112(bgr, left_eye, right_eye, (38.3, 51.6), (73.5, 51.5), 34, 58, 10, 102)

        e1 = self.rec_session.run(None, {self.rec_input_name: crop1})[0][0].astype(np.float32)
        e2 = self.rec_session.run(None, {self.rec_input_name: crop2})[0][0].astype(np.float32)

        e1_n = self._l2_norm(e1)
        e2_n = self._l2_norm(e2)
        combined = self._l2_norm(0.75 * e1_n + 0.25 * e2_n)
        return [float(x) for x in combined]

    @staticmethod
    def compute_antispoof(bgr: np.ndarray, kps5: np.ndarray) -> float:
        """Compute anti-spoof score [0..1] directly on original bgr eye region (pre-upsample)."""
        h, w = bgr.shape[:2]
        left_eye, right_eye = kps5[0], kps5[1]
        eye_dist = float(np.hypot(right_eye[0] - left_eye[0], right_eye[1] - left_eye[1]))
        if eye_dist < 8.0:
            return 0.0

        x1 = max(0, int(min(left_eye[0], right_eye[0]) - 0.30 * eye_dist))
        x2 = min(w, int(max(left_eye[0], right_eye[0]) + 0.30 * eye_dist))
        y1 = max(0, int(min(left_eye[1], right_eye[1]) - 0.22 * eye_dist))
        y2 = min(h, int(max(left_eye[1], right_eye[1]) + 0.22 * eye_dist))
        if x2 - x1 < 12 or y2 - y1 < 6:
            return 0.0

        gray = cv2.cvtColor(bgr[y1:y2, x1:x2], cv2.COLOR_BGR2GRAY)
        lap_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        lap_score = float(np.clip((lap_var - 14.0) / 90.0, 0.0, 1.0))

        p5, p95 = np.percentile(gray, [5, 95])
        dyn_range = float(p95 - p5)
        dyn_score = float(np.clip((dyn_range - 15.0) / 42.0, 0.0, 1.0))

        glare_ratio = float(np.mean(gray >= 246))
        glare_penalty = float(np.clip((glare_ratio - 0.04) * 3.5, 0.0, 0.70))
        glare_bonus = 0.02 if glare_ratio < 0.12 else 0.0

        score = float(np.clip(0.46 * lap_score + 0.44 * dyn_score + glare_bonus - glare_penalty, 0.0, 1.0))
        return round(score, 4)

    @classmethod
    def check_both_eyes_visible(cls, bgr: np.ndarray, kps5: np.ndarray) -> bool:
        """Verify both left and right eyes are clearly visible (reject 1-eye cloth/hand occlusion)."""
        h, w = bgr.shape[:2]
        left_eye, right_eye = kps5[0], kps5[1]
        eye_dist = float(np.hypot(right_eye[0] - left_eye[0], right_eye[1] - left_eye[1]))
        if eye_dist < 8.0:
            return False

        gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
        rad = max(4, int(round(0.18 * eye_dist)))
        stds: list[float] = []
        laps: list[float] = []
        for pt in (left_eye, right_eye):
            cx, cy = int(round(float(pt[0]))), int(round(float(pt[1])))
            patch = gray[max(0, cy - rad) : min(h, cy + rad + 1), max(0, cx - rad) : min(w, cx + rad + 1)]
            if patch.size < 16:
                return False
            s_val = float(np.std(patch))
            l_val = float(cv2.Laplacian(patch, cv2.CV_64F).var())
            if s_val < 8.5 or l_val < 11.0:
                return False
            stds.append(s_val)
            laps.append(l_val)

        if (min(stds) / max(max(stds), 1e-4)) < 0.36 and min(laps) < 16.0:
            return False

        # Reject diagonal 1-eye sleeve/hand occlusion via asymmetric lower-eye skin & brightness
        M = cls._two_point_similarity(
            left_eye,
            right_eye,
            np.array([34.0, 54.0], dtype=np.float32),
            np.array([78.0, 54.0], dtype=np.float32),
        )
        w112 = cv2.warpAffine(bgr, M, (112, 112), flags=cv2.INTER_LINEAR, borderValue=(127, 127, 127))
        ycrcb = cv2.cvtColor(w112, cv2.COLOR_BGR2YCrCb)
        g112 = cv2.cvtColor(w112, cv2.COLOR_BGR2GRAY).astype(np.float32)

        def _skin_frac(patch: np.ndarray) -> float:
            py = patch[:, :, 0].astype(np.float32)
            cr = patch[:, :, 1].astype(np.float32)
            cb = patch[:, :, 2].astype(np.float32)
            return float(np.mean((py >= 40.0) & (cr >= 131.0) & (cr <= 180.0) & (cb >= 73.0) & (cb <= 130.0) & ((cr - cb) >= 6.0)))

        ll = _skin_frac(ycrcb[54:68, 10:42])
        lr = _skin_frac(ycrcb[54:68, 70:102])
        mean_l = float(g112[45:63, 21:47].mean())
        mean_r = float(g112[45:63, 65:91].mean())
        if abs(ll - lr) >= 0.22 and min(ll, lr) < 0.72 and abs(mean_l - mean_r) >= 11.0:
            return False

        return True

    @staticmethod
    def _eye_structural_openness(gray_img: np.ndarray, kps5: np.ndarray, anchor_contrast: float) -> float:
        """Compute normalized structural eye openness (pupil core darkness + vertical eyelid edge energy)."""
        h, w = gray_img.shape[:2]
        left_eye, right_eye = kps5[0], kps5[1]
        eye_dist = float(np.hypot(right_eye[0] - left_eye[0], right_eye[1] - left_eye[1]))
        rad_x = max(8, int(round(0.26 * eye_dist)))
        rad_y = max(6, int(round(0.20 * eye_dist)))

        scores: list[float] = []
        for pt in (left_eye, right_eye):
            cx, cy = int(round(float(pt[0]))), int(round(float(pt[1])))
            x1, x2 = max(0, cx - rad_x), min(w, cx + rad_x + 1)
            y1, y2 = max(0, cy - rad_y), min(h, cy + rad_y + 1)
            patch = gray_img[y1:y2, x1:x2]
            ph, pw = patch.shape[:2]
            if ph < 6 or pw < 6:
                continue

            cw = max(3, int(round(0.65 * pw)))
            ch = max(3, int(round(0.65 * ph)))
            cx0 = max(0, (pw - cw) // 2)
            cy0 = max(0, (ph - ch) // 2)
            cx1 = min(pw, cx0 + cw)
            cy1 = min(ph, cy0 + ch)

            core = patch[cy0:cy1, cx0:cx1]
            ring_mask = np.ones((ph, pw), dtype=bool)
            ring_mask[cy0:cy1, cx0:cx1] = False
            ring_vals = patch[ring_mask]
            if core.size == 0 or ring_vals.size == 0:
                continue

            pupil_darkness = max(0.0, float(np.mean(ring_vals)) - float(np.percentile(core, 20)))
            sobel_y = np.abs(cv2.Sobel(patch, cv2.CV_32F, 0, 1, ksize=3))
            edge_y_energy = float(np.mean(sobel_y))
            scores.append((pupil_darkness + 0.55 * edge_y_energy) / max(anchor_contrast, 12.0))

        return float(np.mean(scores)) if scores else 0.0

    @classmethod
    def compute_liveness(
        cls,
        bgr: np.ndarray,
        aux_bgr: Optional[np.ndarray],
        kps5: np.ndarray,
        antispoof_score: float,
        require_blink: bool = False,
    ) -> float:
        """Compute structural-blink liveness score [0..1] anchored on eyebrow/glabella alignment."""
        if aux_bgr is None:
            if require_blink:
                return 0.0
            if antispoof_score >= 0.50:
                return round(min(0.92, 0.55 + 0.35 * antispoof_score), 4)
            return round(max(0.0, 0.35 * antispoof_score), 4)

        h, w = bgr.shape[:2]
        if aux_bgr.shape[:2] != (h, w):
            aux_bgr = cv2.resize(aux_bgr, (w, h), interpolation=cv2.INTER_LINEAR)

        g1 = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)
        g2 = cv2.cvtColor(aux_bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)

        left_eye, right_eye = kps5[0], kps5[1]
        eye_dist = float(np.hypot(right_eye[0] - left_eye[0], right_eye[1] - left_eye[1]))
        mid_x = float(0.5 * (left_eye[0] + right_eye[0]))
        mid_y = float(0.5 * (left_eye[1] + right_eye[1]))

        # Align g2 onto g1 via eyebrow + glabella anchor template within ±40px
        tx1 = max(0, int(round(mid_x - 0.55 * eye_dist)))
        tx2 = min(w, int(round(mid_x + 0.55 * eye_dist)))
        ty1 = max(0, int(round(mid_y - 0.52 * eye_dist)))
        ty2 = min(h, int(round(mid_y + 0.10 * eye_dist)))
        if tx2 - tx1 < 12 or ty2 - ty1 < 8:
            return 0.20

        sx1, sy1 = max(0, tx1 - 40), max(0, ty1 - 40)
        sx2, sy2 = min(w, tx2 + 40), min(h, ty2 + 40)
        if (sx2 - sx1) <= (tx2 - tx1) or (sy2 - sy1) <= (ty2 - ty1):
            return 0.20

        res_tm = cv2.matchTemplate(g2[sy1:sy2, sx1:sx2], g1[ty1:ty2, tx1:tx2], cv2.TM_CCOEFF_NORMED)
        _, anchor_corr, _, max_loc = cv2.minMaxLoc(res_tm)
        if float(anchor_corr) < 0.68:
            return 0.20

        hx = float((sx1 + max_loc[0]) - tx1)
        hy = float((sy1 + max_loc[1]) - ty1)
        g2_aligned = cv2.warpAffine(
            g2,
            np.array([[1.0, 0.0, -hx], [0.0, 1.0, -hy]], dtype=np.float32),
            (w, h),
            flags=cv2.INTER_LINEAR,
            borderMode=cv2.BORDER_REPLICATE,
        )

        brow_anchor_diff = float(np.mean(np.abs(g1[ty1:ty2, tx1:tx2] - g2_aligned[ty1:ty2, tx1:tx2]))) / 255.0

        rad = max(8, int(0.28 * eye_dist))
        eye_diffs: list[float] = []
        for pt in (left_eye, right_eye):
            cx, cy = int(round(float(pt[0]))), int(round(float(pt[1])))
            x1, x2 = max(0, cx - rad), min(w, cx + rad)
            y1, y2 = max(0, cy - rad), min(h, cy + rad)
            if x2 > x1 and y2 > y1:
                patch_diff = float(np.mean(np.abs(g1[y1:y2, x1:x2] - g2_aligned[y1:y2, x1:x2]))) / 255.0
                eye_diffs.append(patch_diff)

        if not eye_diffs:
            return 0.0

        local_eye_diff = float(np.mean(eye_diffs))

        # Exact identical / frozen face & eyes replay check
        if brow_anchor_diff < 0.0008 and local_eye_diff < 0.0008:
            return 0.0
        eye_to_brow_diff_ratio = local_eye_diff / max(brow_anchor_diff, 0.0045)

        anchor_contrast = max(float(np.std(g1[ty1:ty2, tx1:tx2])), 12.0)
        open_g1 = cls._eye_structural_openness(g1, kps5, anchor_contrast)
        open_g2 = cls._eye_structural_openness(g2_aligned, kps5, anchor_contrast)
        openness_rel_drop = abs(open_g1 - open_g2) / max(open_g1, open_g2, 1e-4)

        # Reject static/noisy, shaken, rotated, zoomed, dimmed, and low-quality spoofs
        if (
            local_eye_diff < 0.010
            or openness_rel_drop < 0.13
            or eye_to_brow_diff_ratio < 1.32
            or antispoof_score < 0.48
        ):
            fail_score = 0.08 + 0.16 * min(1.0, openness_rel_drop / 0.13) * min(1.0, eye_to_brow_diff_ratio / 1.32)
            return round(min(0.28, max(0.05, fail_score)), 4)

        drop_term = float(np.clip((openness_rel_drop - 0.13) / 0.32, 0.0, 1.0))
        ratio_term = float(np.clip((eye_to_brow_diff_ratio - 1.32) / 1.60, 0.0, 1.0))
        diff_term = float(np.clip((local_eye_diff - 0.010) / 0.045, 0.0, 1.0))
        score = 0.74 + 0.24 * (0.45 * drop_term + 0.35 * ratio_term + 0.20 * diff_term)
        return round(float(np.clip(score, 0.74, 0.98)), 4)


engine = PeriocularEngine()


@asynccontextmanager
async def lifespan(_: FastAPI):
    engine.load()
    yield


app = FastAPI(title="HRM Periocular ONNX Service", version="1.0.0", lifespan=lifespan)


def _decode_frame_b64(raw_b64: str) -> tuple[Optional[np.ndarray], Optional[JSONResponse]]:
    payload = raw_b64.strip()
    if payload.startswith("data:"):
        comma_idx = payload.find(",")
        if comma_idx == -1:
            return None, JSONResponse(
                status_code=400,
                content={"ok": False, "code": "INVALID_FRAME", "message": "Invalid data URL format."},
            )
        payload = payload[comma_idx + 1 :]

    if len(payload) > MAX_B64_CHARS:
        return None, JSONResponse(
            status_code=413,
            content={"ok": False, "code": "FRAME_TOO_LARGE", "message": "Frame exceeds 1.4MB limit."},
        )

    try:
        raw_bytes = base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError):
        return None, JSONResponse(
            status_code=400,
            content={"ok": False, "code": "INVALID_FRAME", "message": "Invalid base64 image payload."},
        )

    if len(raw_bytes) == 0:
        return None, JSONResponse(
            status_code=400,
            content={"ok": False, "code": "INVALID_FRAME", "message": "Empty image payload."},
        )
    if len(raw_bytes) > MAX_FRAME_BYTES:
        return None, JSONResponse(
            status_code=413,
            content={"ok": False, "code": "FRAME_TOO_LARGE", "message": "Frame exceeds 1.4MB limit."},
        )

    np_buf = np.frombuffer(raw_bytes, dtype=np.uint8)
    bgr = cv2.imdecode(np_buf, cv2.IMREAD_COLOR)
    if bgr is None or bgr.ndim != 3:
        return None, JSONResponse(
            status_code=400,
            content={"ok": False, "code": "INVALID_FRAME", "message": "Unable to decode image bytes."},
        )

    h, w = bgr.shape[:2]
    if h < MIN_IMAGE_DIM or w < MIN_IMAGE_DIM or h > MAX_IMAGE_DIM or w > MAX_IMAGE_DIM:
        return None, JSONResponse(
            status_code=400,
            content={"ok": False, "code": "INVALID_FRAME_DIMENSIONS", "message": "Unsupported image dimensions."},
        )
    return bgr, None


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": bool(engine.ready),
        "service": "hrm-periocular-onnx",
        "model": "insightface_buffalo_sc_periocular_v1",
        "embedding_dim": 512,
        "ready": bool(engine.ready),
    }


@app.post("/v1/periocular/mask-check")
def mask_check(req: MaskCheckRequest) -> Any:
    if not engine.ready:
        return JSONResponse(
            status_code=503,
            content={"ok": False, "code": "ENGINE_NOT_READY", "message": "ONNX models not loaded."},
        )

    bgr, err_resp = _decode_frame_b64(req.frame_b64)
    if err_resp is not None or bgr is None:
        return err_resp

    # Single-pass SCRFD when clear (keeps CPU latency <= 120ms); fallback Tier 2 eyepair if missed
    detection = engine.detect_tier1_scrfd(bgr, check_neutral_boost=False)
    if detection is None:
        detection = engine.detect_tier2_eyepair(bgr, req.guide_box)

    if detection is None:
        return JSONResponse(
            status_code=422,
            content={
                "ok": False,
                "code": "NO_PERIOCULAR_DETECTED",
                "message": "Không nhận diện rõ khuôn mặt. Vui lòng nhìn thẳng vào camera và đảm bảo đủ sáng.",
            },
        )

    kps5 = detection["kps5"]
    if not engine.check_both_eyes_visible(bgr, kps5):
        return JSONResponse(
            status_code=422,
            content={
                "ok": False,
                "code": "NO_PERIOCULAR_DETECTED",
                "message": "Vui lòng để lộ rõ cả 2 mắt trước camera (không che khuất 1 bên mắt).",
            },
        )
    return {
        "ok": True,
        "face_cover": detection["face_cover"],
        "mask_score": detection["mask_score"],
        "eye_landmarks": {
            "left": [round(float(kps5[0, 0]), 2), round(float(kps5[0, 1]), 2)],
            "right": [round(float(kps5[1, 0]), 2), round(float(kps5[1, 1]), 2)],
        },
    }


@app.post("/v1/periocular/extract")
def extract_periocular(req: ExtractRequest) -> Any:
    if not engine.ready:
        return JSONResponse(
            status_code=503,
            content={"ok": False, "code": "ENGINE_NOT_READY", "message": "ONNX models not loaded."},
        )

    bgr, err_resp = _decode_frame_b64(req.frame_b64)
    if err_resp is not None or bgr is None:
        return err_resp

    aux_bgr: Optional[np.ndarray] = None
    if req.aux_frame_b64:
        aux_bgr, aux_err = _decode_frame_b64(req.aux_frame_b64)
        if aux_err is not None:
            return aux_err

    mode = (req.mode or "auto").strip().lower()
    detection: Optional[dict[str, Any]] = None

    if mode in ("auto", "scrfd_masked"):
        detection = engine.detect_tier1_scrfd(bgr)

    if detection is None and mode in ("auto", "eyepair_periocular"):
        detection = engine.detect_tier2_eyepair(bgr, req.guide_box)

    if detection is None:
        return JSONResponse(
            status_code=422,
            content={
                "ok": False,
                "code": "NO_PERIOCULAR_DETECTED",
                "message": "Không nhận diện rõ khuôn mặt. Vui lòng nhìn thẳng vào camera và đảm bảo đủ sáng.",
            },
        )

    kps5 = detection["kps5"]
    if not engine.check_both_eyes_visible(bgr, kps5):
        return JSONResponse(
            status_code=422,
            content={
                "ok": False,
                "code": "NO_PERIOCULAR_DETECTED",
                "message": "Vui lòng để lộ rõ cả 2 mắt trước camera (không che khuất 1 bên mắt).",
            },
        )
    embedding = engine.extract_embedding(bgr, kps5)
    antispoof_score = engine.compute_antispoof(bgr, kps5)
    liveness_score = engine.compute_liveness(bgr, aux_bgr, kps5, antispoof_score, require_blink=req.require_blink)

    return {
        "ok": True,
        "detection_mode": detection["detection_mode"],
        "mask_occluded": bool(detection["mask_occluded"]),
        "mask_score": float(detection["mask_score"]),
        "face_cover": detection["face_cover"],
        "embedding": embedding,
        "embedding_dim": 512,
        "det_score": round(float(detection["det_score"]), 4),
        "liveness_score": liveness_score,
        "antispoof_score": antispoof_score,
        "eye_landmarks": {
            "left": [round(float(kps5[0, 0]), 2), round(float(kps5[0, 1]), 2)],
            "right": [round(float(kps5[1, 0]), 2), round(float(kps5[1, 1]), 2)],
        },
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8002, log_level="warning")
