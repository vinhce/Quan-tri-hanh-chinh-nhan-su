'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Building2,
  Calendar,
  Clock,
  Cpu,
  Fingerprint,
  Globe,
  Landmark,
  Lock,
  Plus,
  Radio,
  RefreshCw,
  Save,
  Server,
  Trash2,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useApp } from '@/context/app-context';
import { recordAuditLog } from '@/lib/audit-logger';
import {
  fetchSameWifiStatus,
  syncWifiPolicyEverywhere,
} from '@/lib/biometric-attendance';
import {
  fetchAdminMock,
  fetchPayrollMock,
  type PitTaxBracketItem,
} from '@/lib/mock-fetcher';
import {
  getWifiAttendancePolicy,
  HRM_RUNTIME_EVENT,
} from '@/lib/runtime-store';
import type {
  HostWifiHardwareInfo,
  SystemConfiguration,
  WifiAttendancePolicy,
  WifiVerificationResult,
} from '@/mock/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';

function formatVnd(amount: number): string {
  return `${new Intl.NumberFormat('vi-VN').format(amount)} đ`;
}

export function AdminSettingsView() {
  const { role, currentUserProfile, showToast } = useApp();
  const [config, setConfig] = useState<SystemConfiguration | null>(null);
  const [pitBrackets, setPitBrackets] = useState<PitTaxBracketItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [newHolidayName, setNewHolidayName] = useState('');
  const [newHolidayStart, setNewHolidayStart] = useState('2026-12-25');
  const [newHolidayEnd, setNewHolidayEnd] = useState('2026-12-25');
  const [newHolidayDays, setNewHolidayDays] = useState('1');

  const [wifiPolicy, setWifiPolicy] = useState<WifiAttendancePolicy>(() =>
    getWifiAttendancePolicy()
  );
  const [serverPublicIp, setServerPublicIp] = useState<string | null>(null);
  const [hostWifiDetails, setHostWifiDetails] =
    useState<HostWifiHardwareInfo | null>(null);
  const [clientWifiCheck, setClientWifiCheck] =
    useState<WifiVerificationResult | null>(null);
  const [isProbingWifi, setIsProbingWifi] = useState(false);

  const probeServerNetwork = useCallback(async (force = false) => {
    setIsProbingWifi(true);
    try {
      const info = await fetchSameWifiStatus({ forceRefreshIp: force });
      setServerPublicIp(info.hostPublicIpv4);
      setHostWifiDetails(info.hostWifiDetails);
      setClientWifiCheck(info.wifi);
    } catch {
      // ignore offline probe error
    } finally {
      setIsProbingWifi(false);
    }
  }, []);

  const loadData = useCallback(async (bypassCache = false) => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [adminData, payrollData] = await Promise.all([
        fetchAdminMock({ bypassCache }),
        fetchPayrollMock({ bypassCache }),
      ]);
      const savedMinDays =
        typeof window !== 'undefined'
          ? window.localStorage.getItem('hrm_director_min_days')
          : null;
      const parsedMinDays = savedMinDays ? Number(savedMinDays) : NaN;
      setConfig({
        ...adminData.MOCK_SYSTEM_CONFIG,
        director_approval_min_days:
          Number.isFinite(parsedMinDays) && parsedMinDays > 0
            ? parsedMinDays
            : (adminData.MOCK_SYSTEM_CONFIG.director_approval_min_days ?? 3),
        public_holidays_2026: [...adminData.MOCK_SYSTEM_CONFIG.public_holidays_2026],
        ai_engine_config: { ...adminData.MOCK_SYSTEM_CONFIG.ai_engine_config },
      });
      setPitBrackets(payrollData.PIT_TAX_BRACKETS);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Không thể tải cấu hình hệ thống.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
    void probeServerNetwork(false);
    const onSync = () => setWifiPolicy(getWifiAttendancePolicy());
    window.addEventListener(HRM_RUNTIME_EVENT, onSync);
    return () => window.removeEventListener(HRM_RUNTIME_EVENT, onSync);
  }, [loadData, probeServerNetwork]);

  const handleSaveConfig = async () => {
    const minDays = Math.max(1, Number(config?.director_approval_min_days) || 3);
    if (config && typeof window !== 'undefined') {
      window.localStorage.setItem('hrm_director_min_days', String(minDays));
    }
    await syncWifiPolicyEverywhere({
      patch: wifiPolicy,
      actorName: currentUserProfile?.fullName ?? 'Nguyễn Văn An',
      actorRole: role,
    });
    recordAuditLog({
      actor_name: currentUserProfile?.fullName ?? 'Nguyễn Văn An',
      actor_code: currentUserProfile?.employee_code ?? 'NV-2024-001',
      actor_role: role,
      action: 'UPDATE_SETTINGS',
      target: 'Cấu hình hệ thống & Tham số vận hành',
      detail: `Lưu cấu hình hệ thống (ngưỡng Giám đốc duyệt: ${minDays} ngày, giờ chuẩn: ${config?.work_hours_start ?? '08:00'}-${config?.work_hours_end ?? '17:00'}).`,
      status: 'SUCCESS',
    });
    showToast(
      'Đã lưu cấu hình hệ thống',
      'Các tham số giờ làm việc, quy trình phê duyệt và tỷ lệ BHXH/Thuế TNCN đã được áp dụng.',
      'success'
    );
  };

  const handleAddHoliday = (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;
    const trimmedName = newHolidayName.trim();
    if (!trimmedName) {
      showToast('Thiếu tên ngày lễ', 'Vui lòng nhập tên ngày nghỉ lễ trước khi thêm.', 'warning');
      return;
    }
    const paidDays = Math.max(1, Number(newHolidayDays) || 1);
    const code = `HOLIDAY-${Date.now().toString().slice(-4)}`;

    setConfig((prev) =>
      prev
        ? {
            ...prev,
            public_holidays_2026: [
              ...prev.public_holidays_2026,
              {
                holiday_code: code,
                holiday_name: trimmedName,
                start_date: newHolidayStart,
                end_date: newHolidayEnd || newHolidayStart,
                paid_days: paidDays,
              },
            ],
          }
        : prev
    );

    setNewHolidayName('');
    showToast(
      'Đã thêm ngày lễ mới',
      `${trimmedName} (${paidDays} ngày hưởng nguyên lương) đã được đưa vào lịch 2026.`,
      'success'
    );
  };

  const handleRemoveHoliday = (holidayCode: string) => {
    setConfig((prev) =>
      prev
        ? {
            ...prev,
            public_holidays_2026: prev.public_holidays_2026.filter(
              (h) => h.holiday_code !== holidayCode
            ),
          }
        : prev
    );
    showToast('Đã gỡ ngày lễ khỏi lịch', `Mã ngày lễ ${holidayCode} đã được xóa.`, 'default');
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-9 w-44" />
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (loadError || !config) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
          <p className="text-sm font-medium text-rose-600 dark:text-rose-400">
            {loadError ?? 'Không có dữ liệu cấu hình.'}
          </p>
          <Button variant="outline" onClick={() => void loadData(true)}>
            Thử lại
          </Button>
        </CardContent>
      </Card>
    );
  }

  const updateConfig = (updater: (prev: SystemConfiguration) => SystemConfiguration) => {
    setConfig((prev) => (prev ? updater(prev) : prev));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[#11221E] dark:text-zinc-100">
            Cấu hình hệ thống & Tham số vận hành
          </h1>
          <p className="mt-1 text-sm text-[#415A54] dark:text-zinc-400">
            Thiết lập giờ làm việc chuẩn, lịch nghỉ lễ và tỷ lệ trích đóng BHXH / Thuế TNCN.
          </p>
        </div>
        <Button onClick={handleSaveConfig} className="shrink-0">
          <Save className="h-4 w-4" strokeWidth={1.5} />
          Lưu cấu hình hệ thống
        </Button>
      </div>

      {/* Block 1: Company & Working Hours */}
      <Card>
        <CardHeader className="border-b border-[#C6D9D3] pb-4 dark:border-zinc-800/80">
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-[#0F766E] dark:text-teal-400" strokeWidth={1.5} />
            Thông tin doanh nghiệp & Giờ làm việc chuẩn
          </CardTitle>
          <CardDescription>
            Áp dụng mặc định cho chấm công, phép năm và chu kỳ chốt công tính lương hàng tháng.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 pt-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[#415A54] dark:text-zinc-300">
                Tên pháp nhân doanh nghiệp
              </label>
              <Input
                value={config.company_legal_name}
                onChange={(e) =>
                  updateConfig((prev) => ({ ...prev, company_legal_name: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[#415A54] dark:text-zinc-300">
                Mã số thuế doanh nghiệp
              </label>
              <Input
                value={config.company_tax_code}
                onChange={(e) =>
                  updateConfig((prev) => ({ ...prev, company_tax_code: e.target.value }))
                }
                className="font-mono tabular-nums"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-medium text-[#415A54] dark:text-zinc-300">
                <Clock className="h-3.5 w-3.5 text-[#5C7871] dark:text-zinc-400" strokeWidth={1.5} />
                Giờ vào chuẩn
              </label>
              <Input
                type="time"
                value={config.work_hours_start}
                onChange={(e) =>
                  updateConfig((prev) => ({ ...prev, work_hours_start: e.target.value }))
                }
                className="font-mono tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[#415A54] dark:text-zinc-300">
                Giờ tan ca chuẩn
              </label>
              <Input
                type="time"
                value={config.work_hours_end}
                onChange={(e) =>
                  updateConfig((prev) => ({ ...prev, work_hours_end: e.target.value }))
                }
                className="font-mono tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[#415A54] dark:text-zinc-300">
                Ngưỡng đi muộn (phút)
              </label>
              <Input
                type="number"
                value={config.late_grace_threshold_minutes}
                onChange={(e) =>
                  updateConfig((prev) => ({
                    ...prev,
                    late_grace_threshold_minutes: Number(e.target.value) || 0,
                  }))
                }
                className="font-mono tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[#415A54] dark:text-zinc-300">
                Phép năm cơ bản (ngày)
              </label>
              <Input
                type="number"
                value={config.annual_leave_base_days}
                onChange={(e) =>
                  updateConfig((prev) => ({
                    ...prev,
                    annual_leave_base_days: Number(e.target.value) || 12,
                  }))
                }
                className="font-mono tabular-nums"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[#415A54] dark:text-zinc-300">
                Nghỉ trưa từ
              </label>
              <Input
                type="time"
                value={config.lunch_break_start}
                onChange={(e) =>
                  updateConfig((prev) => ({ ...prev, lunch_break_start: e.target.value }))
                }
                className="font-mono tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[#415A54] dark:text-zinc-300">
                Nghỉ trưa đến
              </label>
              <Input
                type="time"
                value={config.lunch_break_end}
                onChange={(e) =>
                  updateConfig((prev) => ({ ...prev, lunch_break_end: e.target.value }))
                }
                className="font-mono tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[#415A54] dark:text-zinc-300">
                Ngày chốt công hàng tháng
              </label>
              <Input
                type="number"
                min={1}
                max={31}
                value={config.payroll_cutoff_day}
                onChange={(e) =>
                  updateConfig((prev) => ({
                    ...prev,
                    payroll_cutoff_day: Number(e.target.value) || 25,
                  }))
                }
                className="font-mono tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[#415A54] dark:text-zinc-300">
                Ngày chi trả lương
              </label>
              <Input
                type="number"
                min={1}
                max={31}
                value={config.payroll_payout_day}
                onChange={(e) =>
                  updateConfig((prev) => ({
                    ...prev,
                    payroll_payout_day: Number(e.target.value) || 5,
                  }))
                }
                className="font-mono tabular-nums"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 rounded-xl border border-[#C6D9D3] bg-[#F2F7F5] p-4 dark:border-zinc-800/80 dark:bg-zinc-900/50 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[#415A54] dark:text-zinc-300">
                Số ngày nghỉ tối thiểu cần Giám đốc duyệt (ngày)
              </label>
              <Input
                type="number"
                min={1}
                max={30}
                value={config.director_approval_min_days}
                onChange={(e) =>
                  updateConfig((prev) => ({
                    ...prev,
                    director_approval_min_days: Math.max(1, Number(e.target.value) || 3),
                  }))
                }
                className="font-mono tabular-nums"
              />
              <p className="text-xs text-[#5C7871] dark:text-zinc-400">
                Đơn nghỉ phép có số ngày vượt ngưỡng này (hoặc nghỉ không lương, công tác nước ngoài) sẽ tự động chuyển thêm tới Giám đốc (DIRECTOR) phê duyệt.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Block 1.5: Biometric & Same-WiFi Attendance Policy */}
      <Card className="border-l-4 border-l-[#0F766E] dark:border-l-teal-400">
        <CardHeader className="border-b border-[#C6D9D3] pb-4 dark:border-zinc-800/80">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Wifi className="h-4 w-4 text-[#0F766E] dark:text-teal-400" strokeWidth={1.5} />
                Chính sách Chấm công Vân tay &amp; Chung mạng WiFi
              </CardTitle>
              <CardDescription className="mt-1">
                Kiểm soát bắt buộc quét đầu đọc vân tay Laptop / Sinh trắc học Điện thoại và khóa chặn ngoài mạng WiFi văn phòng.
              </CardDescription>
            </div>
            <Badge variant={wifiPolicy.enforce_same_wifi ? 'success' : 'warning'}>
              {wifiPolicy.enforce_same_wifi ? 'Đang khóa chung WiFi' : 'Đang mở mạng ngoài'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex items-center justify-between gap-4 rounded-xl border border-[#C6D9D3] bg-[#F2F7F5] p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
              <div>
                <p className="text-sm font-semibold text-[#11221E] dark:text-zinc-100">
                  Bắt buộc chung mạng WiFi văn phòng
                </p>
                <p className="mt-0.5 text-xs text-[#5C7871] dark:text-zinc-400">
                  Chặn 4G/5G và mạng WiFi khác bên ngoài; chỉ cho phép cùng LAN Subnet hoặc trùng Public WiFi IPv4 với máy chủ.
                </p>
              </div>
              <Switch
                checked={wifiPolicy.enforce_same_wifi}
                onCheckedChange={(checked) =>
                  setWifiPolicy((prev) => ({ ...prev, enforce_same_wifi: checked }))
                }
                aria-label="Bật tắt bắt buộc chung mạng WiFi"
              />
            </div>

            <div className="flex items-center justify-between gap-4 rounded-xl border border-[#C6D9D3] bg-[#F2F7F5] p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
              <div>
                <p className="flex items-center gap-1.5 text-sm font-semibold text-[#11221E] dark:text-zinc-100">
                  <Fingerprint className="h-4 w-4 text-[#0F766E] dark:text-teal-400" strokeWidth={1.5} />
                  Bắt buộc vân tay khi Check-in / Check-out
                </p>
                <p className="mt-0.5 text-xs text-[#5C7871] dark:text-zinc-400">
                  Yêu cầu cảm biến vân tay Laptop (Windows Hello / Touch ID) hoặc sinh trắc học Điện thoại trước khi ghi công.
                </p>
              </div>
              <Switch
                checked={wifiPolicy.require_biometric_for_punch}
                onCheckedChange={(checked) =>
                  setWifiPolicy((prev) => ({ ...prev, require_biometric_for_punch: checked }))
                }
                aria-label="Bật tắt bắt buộc vân tay khi chấm công"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[#415A54] dark:text-zinc-300">
                Tên hiển thị mạng WiFi văn phòng
              </label>
              <Input
                value={wifiPolicy.wifi_ssid_label}
                onChange={(e) =>
                  setWifiPolicy((prev) => ({ ...prev, wifi_ssid_label: e.target.value }))
                }
                placeholder="VD: LacViet-Office-5G"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[#415A54] dark:text-zinc-300">
                Danh sách Public IPv4 WiFi cố định (cách nhau dấu phẩy)
              </label>
              <Input
                value={wifiPolicy.allowed_public_ips.join(', ')}
                onChange={(e) =>
                  setWifiPolicy((prev) => ({
                    ...prev,
                    allowed_public_ips: e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  }))
                }
                placeholder="Để trống để tự động khớp Public IP hiện tại của máy chủ"
                className="font-mono tabular-nums"
              />
            </div>
          </div>

          {/* Live Server WiFi & Hardware Telemetry */}
          <div className="space-y-4 rounded-xl border border-[#C6D9D3] bg-[#FCFEFD] p-4 dark:border-zinc-800 dark:bg-zinc-900/35">
            {/* Top Status Bar & Quick Actions */}
            <div className="flex flex-col gap-3 border-b border-[#C6D9D3]/70 pb-3 dark:border-zinc-800/80 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                {hostWifiDetails?.ssid ? (
                  <Badge variant="success" className="gap-1.5">
                    <Wifi className="h-3.5 w-3.5" strokeWidth={1.5} />
                    <span>Đang kết nối WiFi</span>
                  </Badge>
                ) : hostWifiDetails?.connected ? (
                  <Badge variant="teal" className="gap-1.5">
                    <Server className="h-3.5 w-3.5" strokeWidth={1.5} />
                    <span>Kết nối LAN có dây</span>
                  </Badge>
                ) : (
                  <Badge variant="danger" className="gap-1.5">
                    <WifiOff className="h-3.5 w-3.5" strokeWidth={1.5} />
                    <span>Chưa kết nối WiFi</span>
                  </Badge>
                )}

                <span className="font-mono text-sm font-semibold text-[#11221E] dark:text-zinc-100">
                  {hostWifiDetails?.ssid
                    ? `SSID: ${hostWifiDetails.ssid}`
                    : isProbingWifi
                      ? 'Đang quét thông số WiFi...'
                      : 'Chưa phát hiện SSID WiFi'}
                </span>

                {hostWifiDetails?.signalPercent != null && (
                  <Badge
                    variant={
                      hostWifiDetails.signalPercent >= 70
                        ? 'success'
                        : hostWifiDetails.signalPercent >= 40
                          ? 'warning'
                          : 'danger'
                    }
                    className="font-mono tabular-nums"
                  >
                    Sóng {hostWifiDetails.signalPercent}%
                  </Badge>
                )}

                {(hostWifiDetails?.band || hostWifiDetails?.channel != null) && (
                  <Badge variant="outline" className="font-mono tabular-nums">
                    {hostWifiDetails.band || 'WiFi'}
                    {hostWifiDetails.channel != null
                      ? ` · Kênh ${hostWifiDetails.channel}`
                      : ''}
                  </Badge>
                )}

                {hostWifiDetails?.probedAt && (
                  <span className="text-[11px] font-mono tabular-nums text-[#5C7871] dark:text-zinc-400">
                    Quét lúc{' '}
                    {new Date(hostWifiDetails.probedAt).toLocaleTimeString(
                      'vi-VN'
                    )}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isProbingWifi}
                  onClick={() => void probeServerNetwork(true)}
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${isProbingWifi ? 'animate-spin' : ''}`}
                    strokeWidth={1.5}
                  />
                  Quét lại WiFi
                </Button>

                {hostWifiDetails?.ssid &&
                  wifiPolicy.wifi_ssid_label !== hostWifiDetails.ssid && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        const realSsid = hostWifiDetails.ssid!;
                        const saved = await syncWifiPolicyEverywhere({
                          patch: { ...wifiPolicy, wifi_ssid_label: realSsid },
                          actorName:
                            currentUserProfile?.fullName ?? 'Nguyễn Văn An',
                          actorRole: role,
                        });
                        setWifiPolicy(saved);
                        showToast(
                          'Đã đồng bộ tên WiFi thật',
                          `Tên hiển thị WiFi văn phòng đã cập nhật thành "${realSsid}".`,
                          'success'
                        );
                      }}
                    >
                      <Wifi className="h-3.5 w-3.5" strokeWidth={1.5} />
                      Lấy SSID thật ({hostWifiDetails.ssid})
                    </Button>
                  )}

                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={!serverPublicIp}
                  onClick={async () => {
                    if (!serverPublicIp) return;
                    const nextIps = Array.from(
                      new Set([...wifiPolicy.allowed_public_ips, serverPublicIp])
                    );
                    const saved = await syncWifiPolicyEverywhere({
                      patch: { ...wifiPolicy, allowed_public_ips: nextIps },
                      actorName:
                        currentUserProfile?.fullName ?? 'Nguyễn Văn An',
                      actorRole: role,
                    });
                    setWifiPolicy(saved);
                    showToast(
                      'Đã chốt IP WiFi văn phòng',
                      `Public IPv4 ${serverPublicIp} đã được lưu vào chính sách chung WiFi.`,
                      'success'
                    );
                  }}
                >
                  <Wifi className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Chốt IP WiFi hiện tại
                </Button>
              </div>
            </div>

            {/* 8-Card Telemetry Grid */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {/* 1. SSID & BSSID */}
              <div className="min-w-0 rounded-lg border border-[#C6D9D3] bg-[#F2F7F5]/75 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
                <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-[#5C7871] dark:text-zinc-400">
                  <Wifi className="h-3.5 w-3.5 text-[#0F766E] dark:text-teal-400" strokeWidth={1.5} />
                  <span>Tên WiFi (SSID) &amp; BSSID</span>
                </div>
                <p
                  className="mt-1.5 truncate font-mono text-sm font-semibold text-[#11221E] dark:text-zinc-100"
                  title={hostWifiDetails?.ssid || '--'}
                >
                  {hostWifiDetails?.ssid || '--'}
                </p>
                <p
                  className="mt-0.5 truncate font-mono text-[11px] tabular-nums text-[#5C7871] dark:text-zinc-400"
                  title={hostWifiDetails?.bssid || '--'}
                >
                  BSSID: {hostWifiDetails?.bssid || 'Chưa xác định'}
                </p>
              </div>

              {/* 2. Signal % & Link Rate */}
              <div className="min-w-0 rounded-lg border border-[#C6D9D3] bg-[#F2F7F5]/75 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
                <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-[#5C7871] dark:text-zinc-400">
                  <Activity className="h-3.5 w-3.5 text-[#0F766E] dark:text-teal-400" strokeWidth={1.5} />
                  <span>Cường độ sóng &amp; Tốc độ</span>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="font-mono text-sm font-semibold tabular-nums text-[#11221E] dark:text-zinc-100">
                    {hostWifiDetails?.signalPercent != null
                      ? `${hostWifiDetails.signalPercent}%`
                      : '--'}
                  </span>
                  {hostWifiDetails?.signalPercent != null && (
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#C6D9D3] dark:bg-zinc-800">
                      <div
                        className={`h-full rounded-full transition-all ${
                          hostWifiDetails.signalPercent >= 70
                            ? 'bg-emerald-500'
                            : hostWifiDetails.signalPercent >= 40
                              ? 'bg-amber-500'
                              : 'bg-rose-500'
                        }`}
                        style={{ width: `${hostWifiDetails.signalPercent}%` }}
                      />
                    </div>
                  )}
                </div>
                <p className="mt-0.5 truncate font-mono text-[11px] tabular-nums text-[#5C7871] dark:text-zinc-400">
                  ↓ {hostWifiDetails?.rxRateMbps ?? '--'} Mbps · ↑{' '}
                  {hostWifiDetails?.txRateMbps ?? '--'} Mbps
                </p>
              </div>

              {/* 3. Band, Radio & Channel */}
              <div className="min-w-0 rounded-lg border border-[#C6D9D3] bg-[#F2F7F5]/75 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
                <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-[#5C7871] dark:text-zinc-400">
                  <Radio className="h-3.5 w-3.5 text-[#0F766E] dark:text-teal-400" strokeWidth={1.5} />
                  <span>Băng tần &amp; Chuẩn phát</span>
                </div>
                <p className="mt-1.5 truncate font-mono text-sm font-semibold tabular-nums text-[#11221E] dark:text-zinc-100">
                  {hostWifiDetails?.band || '--'}
                  {hostWifiDetails?.radioType
                    ? ` · ${hostWifiDetails.radioType}`
                    : ''}
                </p>
                <p className="mt-0.5 truncate font-mono text-[11px] tabular-nums text-[#5C7871] dark:text-zinc-400">
                  Kênh {hostWifiDetails?.channel ?? '--'} ·{' '}
                  {hostWifiDetails?.networkType || 'Infrastructure'}
                </p>
              </div>

              {/* 4. Authentication & Cipher */}
              <div className="min-w-0 rounded-lg border border-[#C6D9D3] bg-[#F2F7F5]/75 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
                <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-[#5C7871] dark:text-zinc-400">
                  <Lock className="h-3.5 w-3.5 text-[#0F766E] dark:text-teal-400" strokeWidth={1.5} />
                  <span>Bảo mật &amp; Mã hóa</span>
                </div>
                <p
                  className="mt-1.5 truncate font-mono text-sm font-semibold text-[#11221E] dark:text-zinc-100"
                  title={hostWifiDetails?.authentication || '--'}
                >
                  {hostWifiDetails?.authentication || '--'}
                </p>
                <p className="mt-0.5 truncate font-mono text-[11px] text-[#5C7871] dark:text-zinc-400">
                  Cipher: {hostWifiDetails?.cipher || '--'}
                </p>
              </div>

              {/* 5. Adapter & MAC Address */}
              <div className="min-w-0 rounded-lg border border-[#C6D9D3] bg-[#F2F7F5]/75 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
                <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-[#5C7871] dark:text-zinc-400">
                  <Cpu className="h-3.5 w-3.5 text-[#0F766E] dark:text-teal-400" strokeWidth={1.5} />
                  <span>Card mạng &amp; MAC</span>
                </div>
                <p
                  className="mt-1.5 truncate text-xs font-semibold text-[#11221E] dark:text-zinc-100"
                  title={
                    hostWifiDetails?.adapterDescription ||
                    hostWifiDetails?.interfaceName ||
                    '--'
                  }
                >
                  {hostWifiDetails?.adapterDescription ||
                    hostWifiDetails?.interfaceName ||
                    '--'}
                </p>
                <p className="mt-0.5 truncate font-mono text-[11px] tabular-nums text-[#5C7871] dark:text-zinc-400">
                  {hostWifiDetails?.interfaceName || '--'} ·{' '}
                  {hostWifiDetails?.macAddress || '--'}
                </p>
              </div>

              {/* 6. Local IPv4 & Subnet */}
              <div className="min-w-0 rounded-lg border border-[#C6D9D3] bg-[#F2F7F5]/75 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
                <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-[#5C7871] dark:text-zinc-400">
                  <Server className="h-3.5 w-3.5 text-[#0F766E] dark:text-teal-400" strokeWidth={1.5} />
                  <span>IPv4 Nội bộ &amp; Subnet</span>
                </div>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <span className="truncate font-mono text-sm font-semibold tabular-nums text-[#0F766E] dark:text-teal-400">
                    {hostWifiDetails?.ipv4Address || '--'}
                  </span>
                  {hostWifiDetails?.dhcpEnabled != null && (
                    <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                      {hostWifiDetails.dhcpEnabled ? 'DHCP' : 'IP Tĩnh'}
                    </Badge>
                  )}
                </div>
                <p
                  className="mt-0.5 truncate font-mono text-[11px] tabular-nums text-[#5C7871] dark:text-zinc-400"
                  title={`${hostWifiDetails?.cidr || '--'} (${hostWifiDetails?.subnetMask || '--'})`}
                >
                  {hostWifiDetails?.cidr || '--'}
                  {hostWifiDetails?.subnetMask
                    ? ` (${hostWifiDetails.subnetMask})`
                    : ''}
                </p>
              </div>

              {/* 7. Gateway & DNS */}
              <div className="min-w-0 rounded-lg border border-[#C6D9D3] bg-[#F2F7F5]/75 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
                <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-[#5C7871] dark:text-zinc-400">
                  <Globe className="h-3.5 w-3.5 text-[#0F766E] dark:text-teal-400" strokeWidth={1.5} />
                  <span>Gateway &amp; Máy chủ DNS</span>
                </div>
                <p className="mt-1.5 truncate font-mono text-sm font-semibold tabular-nums text-[#11221E] dark:text-zinc-100">
                  {hostWifiDetails?.defaultGateway || '--'}
                </p>
                <p
                  className="mt-0.5 truncate font-mono text-[11px] tabular-nums text-[#5C7871] dark:text-zinc-400"
                  title={hostWifiDetails?.dnsServers?.join(', ') || '--'}
                >
                  DNS:{' '}
                  {hostWifiDetails?.dnsServers?.length
                    ? hostWifiDetails.dnsServers.join(', ')
                    : '--'}
                </p>
              </div>

              {/* 8. Public WAN IP & Same-WiFi Gate */}
              <div className="min-w-0 rounded-lg border border-[#C6D9D3] bg-[#F2F7F5]/75 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
                <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-[#5C7871] dark:text-zinc-400">
                  <Globe className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" strokeWidth={1.5} />
                  <span>Public WAN &amp; Đối chiếu</span>
                </div>
                <p className="mt-1.5 truncate font-mono text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {hostWifiDetails?.publicIpv4 ||
                    serverPublicIp ||
                    'Chưa xác định'}
                </p>
                <p
                  className="mt-0.5 truncate font-mono text-[11px] tabular-nums text-[#5C7871] dark:text-zinc-400"
                  title={`IPv6 /64: ${hostWifiDetails?.publicIpv6Prefix64 || 'Không dùng'} · Mode: ${clientWifiCheck?.mode || '--'}`}
                >
                  Gate: {clientWifiCheck?.mode || '--'}
                  {hostWifiDetails?.publicIpv6Prefix64
                    ? ` · v6 ${hostWifiDetails.publicIpv6Prefix64}`
                    : ''}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Block 2: Public Holidays */}
      <Card>
        <CardHeader className="border-b border-[#C6D9D3] pb-4 dark:border-zinc-800/80">
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-[#0F766E] dark:text-teal-400" strokeWidth={1.5} />
            Lịch nghỉ lễ trong năm 2026
          </CardTitle>
          <CardDescription>
            Các ngày nghỉ lễ hưởng nguyên lương dùng để tự động trừ ngày công chuẩn khi tính lương.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-5">
          <form
            onSubmit={handleAddHoliday}
            className="grid grid-cols-1 gap-3 rounded-xl border border-[#C6D9D3] bg-[#F2F7F5] p-4 dark:border-zinc-800/80 dark:bg-zinc-900/50 md:grid-cols-12"
          >
            <div className="md:col-span-5">
              <label className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-400">
                Tên ngày lễ
              </label>
              <Input
                value={newHolidayName}
                onChange={(e) => setNewHolidayName(e.target.value)}
                placeholder="Ví dụ: Nghỉ Giáng sinh doanh nghiệp"
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-400">
                Từ ngày
              </label>
              <Input
                type="date"
                value={newHolidayStart}
                onChange={(e) => setNewHolidayStart(e.target.value)}
                className="font-mono tabular-nums"
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-400">
                Đến ngày
              </label>
              <Input
                type="date"
                value={newHolidayEnd}
                onChange={(e) => setNewHolidayEnd(e.target.value)}
                className="font-mono tabular-nums"
              />
            </div>
            <div className="md:col-span-1">
              <label className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-400">
                Số ngày
              </label>
              <Input
                type="number"
                min={1}
                value={newHolidayDays}
                onChange={(e) => setNewHolidayDays(e.target.value)}
                className="font-mono tabular-nums"
              />
            </div>
            <div className="flex items-end md:col-span-2">
              <Button type="submit" variant="secondary" className="w-full">
                <Plus className="h-4 w-4" strokeWidth={1.5} />
                Thêm ngày lễ
              </Button>
            </div>
          </form>

          <div className="overflow-x-auto rounded-[12px] border border-[#C6D9D3] bg-[#FCFEFD] shadow-[0_1px_3px_rgba(17,34,30,0.05)] dark:border-zinc-800/80 dark:bg-transparent">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead className="bg-[#F2F7F5] dark:bg-zinc-900/50">
                <tr className="border-b border-[#C6D9D3] bg-[#F2F7F5] text-xs font-semibold text-[#415A54] dark:border-zinc-800/80 dark:bg-zinc-900/50 dark:text-zinc-400">
                  <th className="whitespace-nowrap px-4 py-2.5">Mã lễ</th>
                  <th className="px-4 py-2.5">Tên kỳ nghỉ</th>
                  <th className="px-4 py-2.5">Từ ngày</th>
                  <th className="px-4 py-2.5">Đến ngày</th>
                  <th className="px-4 py-2.5 text-right">Ngày hưởng lương</th>
                  <th className="px-4 py-2.5 text-right">Xóa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D5E3DF] dark:divide-zinc-800/70">
                {config.public_holidays_2026.map((holiday) => (
                  <tr
                    key={holiday.holiday_code}
                    className="odd:bg-[#FCFEFD] even:bg-[#F5FAF8] transition-colors hover:bg-[#E8F3EF] dark:odd:bg-transparent dark:even:bg-transparent dark:hover:bg-zinc-900/40"
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-[#415A54] dark:text-zinc-400">
                      {holiday.holiday_code}
                    </td>
                    <td className="px-4 py-3 font-semibold text-[#11221E] dark:text-zinc-100">
                      {holiday.holiday_name}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs tabular-nums text-[#415A54] dark:text-zinc-400">
                      {holiday.start_date}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs tabular-nums text-[#415A54] dark:text-zinc-400">
                      {holiday.end_date}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs font-semibold tabular-nums text-[#11221E] dark:text-zinc-100">
                      {holiday.paid_days} ngày
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveHoliday(holiday.holiday_code)}
                        aria-label={`Xóa ${holiday.holiday_name}`}
                      >
                        <Trash2 className="h-4 w-4 text-[#5C7871] hover:text-red-600 dark:text-zinc-400" strokeWidth={1.5} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Block 3: Insurance & PIT Tax Brackets */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-5">
          <CardHeader className="border-b border-[#C6D9D3] pb-4 dark:border-zinc-800/80">
            <CardTitle className="flex items-center gap-2">
              <Landmark className="h-4 w-4 text-[#0F766E] dark:text-teal-400" strokeWidth={1.5} />
              Tỷ lệ BHXH / BHYT / BHTN & Giảm trừ
            </CardTitle>
            <CardDescription>
              Tỷ lệ trích đóng phía người lao động và mức giảm trừ gia cảnh hiện hành.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-5">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[#415A54] dark:text-zinc-300">
                  BHXH (%)
                </label>
                <Input
                  type="number"
                  step="0.5"
                  value={config.bhxh_employee_percent}
                  onChange={(e) =>
                    updateConfig((prev) => ({
                      ...prev,
                      bhxh_employee_percent: Number(e.target.value) || 0,
                    }))
                  }
                  className="font-mono tabular-nums"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[#415A54] dark:text-zinc-300">
                  BHYT (%)
                </label>
                <Input
                  type="number"
                  step="0.5"
                  value={config.bhyt_employee_percent}
                  onChange={(e) =>
                    updateConfig((prev) => ({
                      ...prev,
                      bhyt_employee_percent: Number(e.target.value) || 0,
                    }))
                  }
                  className="font-mono tabular-nums"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[#415A54] dark:text-zinc-300">
                  BHTN (%)
                </label>
                <Input
                  type="number"
                  step="0.5"
                  value={config.bhtn_employee_percent}
                  onChange={(e) =>
                    updateConfig((prev) => ({
                      ...prev,
                      bhtn_employee_percent: Number(e.target.value) || 0,
                    }))
                  }
                  className="font-mono tabular-nums"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[#415A54] dark:text-zinc-300">
                Giảm trừ bản thân (VND / tháng)
              </label>
              <Input
                type="number"
                step={500000}
                value={config.personal_deduction_vnd}
                onChange={(e) =>
                  updateConfig((prev) => ({
                    ...prev,
                    personal_deduction_vnd: Number(e.target.value) || 0,
                  }))
                }
                className="font-mono tabular-nums"
              />
              <p className="font-mono text-xs tabular-nums text-[#5C7871] dark:text-zinc-400">
                Hiển thị: {formatVnd(config.personal_deduction_vnd)}
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[#415A54] dark:text-zinc-300">
                Giảm trừ mỗi người phụ thuộc (VND / tháng)
              </label>
              <Input
                type="number"
                step={200000}
                value={config.dependent_deduction_vnd}
                onChange={(e) =>
                  updateConfig((prev) => ({
                    ...prev,
                    dependent_deduction_vnd: Number(e.target.value) || 0,
                  }))
                }
                className="font-mono tabular-nums"
              />
              <p className="font-mono text-xs tabular-nums text-[#5C7871] dark:text-zinc-400">
                Hiển thị: {formatVnd(config.dependent_deduction_vnd)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden rounded-[12px] border-[#C6D9D3] bg-[#FCFEFD] shadow-[0_1px_3px_rgba(17,34,30,0.05)] dark:border-zinc-800/80 dark:bg-zinc-900 lg:col-span-7">
          <CardHeader className="border-b border-[#C6D9D3] pb-4 dark:border-zinc-800/80">
            <CardTitle>Biểu thuế TNCN lũy tiến từng phần ({pitBrackets.length} bậc)</CardTitle>
            <CardDescription>
              Từ kỳ 2026: 5 bậc (NQ 110/2025/UBTVQH15 &amp; Luật 109/2025/QH15). Kỳ &lt;= 2025 giữ nguyên 7 bậc. Tham chiếu tự động theo kỳ lương.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto bg-[#FCFEFD] dark:bg-transparent">
              <table className="w-full min-w-[520px] border-collapse text-left text-sm">
                <thead className="bg-[#F2F7F5] dark:bg-zinc-900/50">
                  <tr className="border-b border-[#C6D9D3] bg-[#F2F7F5] text-xs font-semibold text-[#415A54] dark:border-zinc-800/80 dark:bg-zinc-900/50 dark:text-zinc-400">
                    <th className="px-4 py-2.5">Bậc</th>
                    <th className="px-4 py-2.5">Phần thu nhập tính thuế / tháng</th>
                    <th className="px-4 py-2.5 text-right">Thuế suất</th>
                    <th className="px-4 py-2.5 text-right">Số trừ nhanh</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D5E3DF] dark:divide-zinc-800/70">
                  {pitBrackets.map((bracket) => (
                    <tr
                      key={bracket.level}
                      className="odd:bg-[#FCFEFD] even:bg-[#F5FAF8] transition-colors hover:bg-[#E8F3EF] dark:odd:bg-transparent dark:even:bg-transparent dark:hover:bg-zinc-900/40"
                    >
                      <td className="px-4 py-2.5 font-mono text-xs font-medium tabular-nums text-[#415A54] dark:text-zinc-300">
                        Bậc {bracket.level}
                      </td>
                      <td className="px-4 py-2.5 text-xs font-medium text-[#11221E] dark:text-zinc-200">
                        {bracket.label}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs font-semibold tabular-nums text-[#0F766E] dark:text-teal-400">
                        {bracket.rate_percent}%
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-[#415A54] dark:text-zinc-400">
                        {formatVnd(bracket.quick_subtract_vnd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
