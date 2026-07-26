export interface IssueResponse {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  category: string;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  status: string;
  image_urls: string[] | null;
  supports_count: number | null;
  master_issue_id?: string | null;
  created_at: string;
  updated_at: string;
  case_number?: string | null;
  coordination_type?: string | null;
  coordination_status?: string | null;
  lead_department?: string | null;
  coordination_started_at?: string | null;
  case_participations?: RawParticipation[] | null;
  department_tasks?: RawDepartmentTask[] | null;
  task_handoffs?: RawTaskHandoff[] | null;
  coordination_change_requests?: RawCoordinationChangeRequest[] | null;
  task_transfer_requests?: RawTaskTransferRequest[] | null;
  data_origin?: string | null;
  ai_provider?: string | null;
  ai_model?: string | null;
  ai_analyzed_at?: string | null;
  ai_confidence?: number | null;
  ai_status?: string | null;
  ai_request_started_at?: string | null;
  ai_response_received_at?: string | null;
  ai_plan_ready_at?: string | null;
  ai_latency_ms?: number | null;
  ai_detected_issue?: string | null;
  ai_reason?: string | null;
  ai_risk?: string | null;
  ai_priority?: string | null;
  ai_objects?: string[] | null;
  ai_category?: string | null;
  ai_supporting_departments?: string[] | null;
  ai_requires_multiple_departments?: boolean | null;
  ai_estimated_response_time?: string | null;
  ai_detection_time_ms?: number | null;
  ai_citizen_corrected?: boolean | null;
}

export interface RawDepartmentTask {
  id: string;
  case_id: string;
  department: string;
  task_code: string;
  title: string;
  description: string | null;
  task_status: string;
  priority: string;
  assigned_by: string | null;
  assigned_to: string | null;
  accepted_by: string | null;
  accepted_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  blocked_at: string | null;
  blocked_reason: string | null;
  rejection_reason: string | null;
  due_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface RawParticipation {
  id: string;
  case_id: string;
  department: string;
  participation_role: string;
  status: string;
  responsibility_reason: string | null;
  joined_at: string;
}

export interface RawTaskHandoff {
  id: string;
  case_id: string;
  source_task_id: string;
  target_task_id: string;
  from_department: string;
  to_department: string;
  handoff_status: string;
  revision_number: number;
  submission_note: string | null;
  acceptance_note: string | null;
  rejection_reason: string | null;
  submitted_by: string | null;
  submitted_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  supersedes_handoff_id: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  handoff_evidence?: RawHandoffEvidence[] | null;
}

export interface RawHandoffEvidence {
  id: string;
  handoff_id: string;
  evidence_type: string;
  storage_path: string | null;
  public_url: string | null;
  latitude: number | null;
  longitude: number | null;
  captured_at: string | null;
  uploaded_by: string | null;
  metadata: any | null;
  checksum: string | null;
  created_at: string;
}

export interface RawCoordinationChangeRequest {
  id: string;
  case_id: string;
  requested_by: string | null;
  requesting_department: string;
  request_type: string;
  proposed_department: string | null;
  reason: string;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  resolution_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface RawTaskTransferRequest {
  id: string;
  case_id: string;
  task_id: string;
  from_department: string;
  proposed_to_department: string;
  reason: string;
  status: string;
  requested_by: string | null;
  reviewed_by: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface RawSLAPolicy {
  id: string;
  policy_code: string;
  name: string;
  scope_type: string;
  department: string | null;
  issue_category: string | null;
  severity: string | null;
  inactivity_minutes: number | null;
  resolution_minutes: number | null;
  active: boolean;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface RawSLAInstance {
  id: string;
  case_id: string;
  entity_type: string;
  entity_id: string;
  policy_id: string | null;
  clock_type: string;
  started_at: string;
  due_at: string;
  paused_at: string | null;
  resumed_at: string | null;
  completed_at: string | null;
  breached_at: string | null;
  status: string;
  pause_reason: string | null;
  accumulated_pause_seconds: number;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface RawEscalation {
  id: string;
  case_id: string;
  source_entity_type: string;
  source_entity_id: string;
  sla_instance_id: string | null;
  escalation_policy_id: string | null;
  current_level: number;
  severity: string;
  escalation_type: string;
  status: string;
  root_cause_department: string | null;
  reason_code: string | null;
  reason_detail: string | null;
  first_escalated_at: string;
  last_escalated_at: string;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface RawCommissionerIntervention {
  id: string;
  case_id: string;
  escalation_id: string | null;
  intervention_type: string;
  target_task_id: string | null;
  target_department: string | null;
  initiated_by: string | null;
  reason: string;
  instruction: string;
  previous_state: any;
  resulting_state: any;
  status: string;
  created_at: string;
  completed_at: string | null;
}

export interface RawTaskBlocker {
  id: string;
  case_id: string;
  task_id: string;
  blocker_type: string;
  blocking_department: string | null;
  external_reference: string | null;
  reason: string;
  status: string;
  declared_by: string | null;
  declared_at: string;
  resolved_by: string | null;
  resolved_at: string | null;
}

export interface RawSLAExceptionRequest {
  id: string;
  sla_instance_id: string;
  requested_by: string | null;
  reason_code: string | null;
  justification: string;
  requested_extension_minutes: number;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  decision_note: string | null;
}
