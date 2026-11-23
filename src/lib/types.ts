export type Role = "admin" | "staff" | "student";

export interface Shift { id: string; name: string; start_time: string; end_time: string; is_full_day: boolean; sort: number; active: boolean }
export interface Seat { id: string; label: string; row_no: number; col_no: number; tags: string[]; active: boolean }
export interface Plan { id: string; name: string; shift_id: string; duration_days: number; price: number; admission_fee: number; active: boolean }

export interface Student {
  id: string; user_id: string | null; code: string; full_name: string; phone: string; email: string | null;
  gender: string | null; dob: string | null; address: string | null; guardian_name: string | null; guardian_phone: string | null;
  exam_target: string | null; photo_path: string | null; id_type: string | null; id_last4: string | null; id_doc_path: string | null;
  admission_date: string; status: "active" | "left"; device_id: string | null; qr_token: string; notes: string | null; created_at: string;
}

export interface StudentStatus {
  student_id: string; code: string; full_name: string; phone: string; photo_path: string | null; status: "active" | "left";
  admission_date: string; device_id: string | null;
  membership_id: string | null; start_date: string | null; end_date: string | null;
  shift_id: string | null; shift_name: string | null; start_time: string | null; end_time: string | null; is_full_day: boolean | null;
  seat_id: string | null; seat_label: string | null; plan_id: string | null; plan_name: string | null;
  days_left: number | null; plan_state: "active" | "expiring" | "expired" | "upcoming" | "no_plan";
  balance_due: number; last_reminded_at: string | null;
}

export interface Membership {
  id: string; student_id: string; plan_id: string | null; shift_id: string; seat_id: string | null;
  start_date: string; end_date: string; fee: number; admission_fee: number; discount: number; total: number;
  status: "active" | "cancelled"; note: string | null; created_at: string;
  shifts?: { name: string } | null; seats?: { label: string } | null; plans?: { name: string } | null;
}

export interface Payment {
  id: string; student_id: string; membership_id: string | null; amount: number; mode: string; paid_at: string;
  note: string | null; receipt_no: string; public_token: string; created_at: string;
  students?: { full_name: string; phone: string; code: string } | null;
}

export interface Attendance {
  id: string; student_id: string; att_date: string; check_in: string; check_out: string | null;
  method: "qr" | "staff"; outside_shift: boolean; auto_closed: boolean;
  students?: { full_name: string; code: string; photo_path: string | null } | null;
}

export interface SeatBoardRow {
  seat_id: string; label: string; row_no: number; col_no: number; tags: string[]; active: boolean;
  occupied: boolean; student_id: string | null; student_name: string | null; occupant_shift: string | null; end_date: string | null;
}

export interface LibrarySettings {
  id: number; name: string; tagline: string | null; address: string | null; phone: string | null; email: string | null;
  logo_url: string | null; primary_color: string; timezone: string; latitude: number | null; longitude: number | null;
  geofence_enabled: boolean; geofence_m: number; gate_key: string; checkin_grace_min: number; cooldown_sec: number;
  auto_checkout_min: number; receipt_prefix: string; upi_id: string | null; reminder_template: string;
}

export interface ScanResult {
  ok: boolean; code?: string; action?: "in" | "out"; name?: string; seat?: string | null; shift?: string | null;
  outside_shift?: boolean; end_date?: string | null; start_date?: string | null; days_left?: number | null; minutes?: number;
  distance_m?: number; wait_sec?: number; check_in?: string; check_out?: string;
}
