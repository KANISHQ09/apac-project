import { IssueStatus } from "./IssueStatus";
import { IssueCategory } from "./IssueCategory";

export interface Issue {
  id: string;
  userId: string;
  title: string;
  description: string;
  category: IssueCategory | string;
  location: string;
  status: IssueStatus;
  imageUrls: string[];
  supportsCount: number;
  masterIssueId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  createdAt: Date;
  updatedAt?: Date;
  caseNumber?: string;
  coordinationType?: string;
  coordinationStatus?: string;
  leadDepartment?: string;
  coordinationStartedAt?: Date;
  participations?: CaseParticipation[];
  tasks?: DepartmentTask[];
  handoffs?: TaskHandoff[];
  changeRequests?: CoordinationChangeRequest[];
  transferRequests?: TaskTransferRequest[];
  dataOrigin?: string | null;
  aiProvider?: string | null;
  aiModel?: string | null;
  aiAnalyzedAt?: Date | null;
  aiConfidence?: number | null;
  aiStatus?: string | null;
  aiRequestStartedAt?: Date | null;
  aiResponseReceivedAt?: Date | null;
  aiPlanReadyAt?: Date | null;
  aiLatencyMs?: number | null;
  aiDetectedIssue?: string | null;
  aiReason?: string | null;
  aiRisk?: string | null;
  aiPriority?: string | null;
  aiObjects?: string[] | null;
  aiCategory?: string | null;
  aiSupportingDepartments?: string[] | null;
  aiRequiresMultipleDepartments?: boolean | null;
  aiEstimatedResponseTime?: string | null;
  aiDetectionTimeMs?: number | null;
  aiCitizenCorrected?: boolean | null;
  coordinationPlans?: any[];
}

export interface CaseParticipation {
  id: string;
  caseId: string;
  department: string;
  participationRole: "LEAD" | "RESPONSIBLE" | "SUPPORTING" | "CONSULTED" | "OBSERVER";
  status: "PROPOSED" | "ACTIVE" | "REMOVED";
  responsibilityReason?: string | null;
  joinedAt: Date;
}

export interface DepartmentTask {
  id: string;
  caseId: string;
  department: string;
  taskCode: string;
  title: string;
  description?: string | null;
  taskStatus: "DRAFT" | "ASSIGNED" | "WAITING_DEPENDENCY" | "READY" | "ACCEPTED" | "WORKING" | "BLOCKED" | "COMPLETED" | "REJECTED" | "CANCELLED";
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  assignedBy?: string | null;
  assignedTo?: string | null;
  acceptedBy?: string | null;
  acceptedAt?: Date | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  blockedAt?: Date | null;
  blockedReason?: string | null;
  rejectionReason?: string | null;
  dueAt?: Date | null;
  version: number;
  completionEvidenceRules?: any;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskDependency {
  id: string;
  caseId: string;
  predecessorTaskId: string;
  successorTaskId: string;
  dependencyType: "FINISH_TO_START" | "FINISH_TO_FINISH";
  requiresHandoff: boolean;
  handoffPolicy?: string | null;
  createdBy?: string | null;
  createdAt: Date;
}

export interface WorkflowEvent {
  id: string;
  caseId: string;
  taskId?: string | null;
  actorId?: string | null;
  actorDepartment?: string | null;
  eventType: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  metadata?: Record<string, any> | null;
  createdAt: Date;
}

export interface TaskHandoff {
  id: string;
  caseId: string;
  sourceTaskId: string;
  targetTaskId: string;
  fromDepartment: string;
  toDepartment: string;
  handoffStatus: "DRAFT" | "SUBMITTED" | "UNDER_REVIEW" | "ACCEPTED" | "REJECTED" | "SUPERSEDED" | "CANCELLED";
  revisionNumber: number;
  submissionNote?: string | null;
  acceptanceNote?: string | null;
  rejectionReason?: string | null;
  submittedBy?: string | null;
  submittedAt: Date;
  reviewedBy?: string | null;
  reviewedAt?: Date | null;
  supersedesHandoffId?: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  evidence?: HandoffEvidence[];
}

export interface HandoffEvidence {
  id: string;
  handoffId: string;
  evidenceType: "PHOTO" | "VIDEO" | "DOCUMENT" | "INSPECTION_NOTE" | "GEO_CONFIRMATION" | "OTHER";
  storagePath?: string | null;
  publicUrl?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  capturedAt?: Date | null;
  uploadedBy?: string | null;
  metadata?: Record<string, any> | null;
  checksum?: string | null;
  createdAt: Date;
}

export interface CoordinationChangeRequest {
  id: string;
  caseId: string;
  requestedBy?: string | null;
  requestingDepartment: string;
  requestType: "ADD_DEPARTMENT" | "REMOVE_DEPARTMENT" | "CHANGE_LEAD" | "ADD_TASK" | "RESEQUENCE" | "EMERGENCY_SUPPORT";
  proposedDepartment?: string | null;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  reviewedBy?: string | null;
  reviewedAt?: Date | null;
  resolutionNote?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskTransferRequest {
  id: string;
  caseId: string;
  taskId: string;
  fromDepartment: string;
  proposedToDepartment: string;
  reason: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED" | "CANCELLED";
  requestedBy?: string | null;
  reviewedBy?: string | null;
  createdAt: Date;
  resolvedAt?: Date | null;
}

export interface SLAPolicy {
  id: string;
  policyCode: string;
  name: string;
  scopeType: "CASE" | "TASK" | "HANDOFF" | "STATUS";
  department?: string | null;
  issueCategory?: string | null;
  severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | null;
  inactivityMinutes?: number | null;
  resolutionMinutes?: number | null;
  active: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SLAInstance {
  id: string;
  caseId: string;
  entityType: "CASE" | "TASK" | "HANDOFF";
  entityId: string;
  policyId?: string | null;
  clockType: "ACKNOWLEDGEMENT" | "TASK_START" | "TASK_COMPLETION" | "HANDOFF_REVIEW" | "BLOCKED_DEPENDENCY" | "REWORK" | "INACTIVITY";
  startedAt: Date;
  dueAt: Date;
  pausedAt?: Date | null;
  resumedAt?: Date | null;
  completedAt?: Date | null;
  breachedAt?: Date | null;
  status: "ACTIVE" | "PAUSED" | "COMPLETED" | "BREACHED" | "CANCELLED";
  pauseReason?: string | null;
  accumulatedPauseSeconds: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Escalation {
  id: string;
  caseId: string;
  sourceEntityType: "CASE" | "TASK" | "HANDOFF";
  sourceEntityId: string;
  slaInstanceId?: string | null;
  escalationPolicyId?: string | null;
  currentLevel: number;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  escalationType: "SLA_BREACH" | "TASK_INACTIVITY" | "DEPENDENCY_BLOCK" | "HANDOFF_REVIEW_DELAY" | "REPEATED_HANDOFF_REJECTION" | "REWORK_LOOP" | "TRANSFER_LOOP" | "CHANGE_REQUEST_DELAY" | "CROSS_DEPARTMENT_DEADLOCK" | "CRITICAL_CASE_STALL";
  status: "OPEN" | "ACKNOWLEDGED" | "INTERVENTION_REQUIRED" | "RESOLVED" | "CANCELLED";
  rootCauseDepartment?: string | null;
  reasonCode?: string | null;
  reasonDetail?: string | null;
  firstEscalatedAt: Date;
  lastEscalatedAt: Date;
  acknowledgedBy?: string | null;
  acknowledgedAt?: Date | null;
  resolvedBy?: string | null;
  resolvedAt?: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CommissionerIntervention {
  id: string;
  caseId: string;
  escalationId?: string | null;
  interventionType: "PRIORITY_OVERRIDE" | "REASSIGN_TASK" | "ADD_SUPPORT_DEPARTMENT" | "FORCE_COORDINATION_REVIEW" | "EMERGENCY_SEQUENCE_OVERRIDE" | "REQUEST_JOINT_MEETING" | "APPOINT_COORDINATION_OWNER" | "EXTEND_SLA_WITH_REASON" | "CANCEL_INVALID_ESCALATION";
  targetTaskId?: string | null;
  targetDepartment?: string | null;
  initiatedBy?: string | null;
  reason: string;
  instruction: string;
  previousState?: any;
  resultingState?: any;
  status: string;
  createdAt: Date;
  completedAt?: Date | null;
}

export interface TaskBlocker {
  id: string;
  caseId: string;
  taskId: string;
  blockerType: "DEPENDENCY" | "RESOURCE" | "APPROVAL" | "BUDGET" | "FIELD_CONDITION" | "EXTERNAL_AGENCY" | "SAFETY" | "OTHER";
  blockingDepartment?: string | null;
  externalReference?: string | null;
  reason: string;
  status: "ACTIVE" | "RESOLVED";
  declaredBy?: string | null;
  declaredAt: Date;
  resolvedBy?: string | null;
  resolvedAt?: Date | null;
}

export interface SLAExceptionRequest {
  id: string;
  slaInstanceId: string;
  requestedBy?: string | null;
  reasonCode?: string | null;
  justification: string;
  requestedExtensionMinutes: number;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewedBy?: string | null;
  reviewedAt?: Date | null;
  decisionNote?: string | null;
}

export interface AICoordinationPlan {
  id: string;
  caseId: string;
  planVersion: number;
  status: "PENDING" | "GENERATING" | "GENERATED" | "VALIDATION_FAILED" | "REVIEW_REQUIRED" | "APPROVED" | "REJECTED" | "SUPERSEDED" | "ACTIVATION_FAILED" | "ACTIVATED";
  modelProvider?: string;
  modelName?: string;
  promptVersion?: string;
  inputSnapshot?: any;
  visionSnapshot?: any;
  nearbyContextSnapshot?: any;
  rawModelResponse?: any;
  validatedPlan?: any;
  confidence?: number;
  riskLevel?: string;
  explanation?: string;
  generationStartedAt: Date;
  generationCompletedAt?: Date | null;
  generatedByService?: string;
  approvedBy?: string | null;
  approvedAt?: Date | null;
  rejectedBy?: string | null;
  rejectedAt?: Date | null;
  rejectionReason?: string | null;
  supersedesPlanId?: string | null;
  createdAt: Date;
  updatedAt: Date;
  participants?: AIPlanParticipant[];
  tasks?: AIPlanTask[];
  dependencies?: AIPlanDependency[];
}

export interface AIPlanParticipant {
  id: string;
  planId: string;
  department: string;
  participationRole: "LEAD" | "RESPONSIBLE" | "SUPPORTING" | "CONSULTED" | "OBSERVER";
  responsibilityReason?: string | null;
  createdAt: Date;
}

export interface AIPlanTask {
  id: string;
  planId: string;
  tempId: string;
  department: string;
  title: string;
  description?: string | null;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  slaDurationMinutes: number;
  completionEvidenceRules?: any;
  createdAt: Date;
}

export interface AIPlanDependency {
  id: string;
  planId: string;
  predecessorTempId: string;
  successorTempId: string;
  reason?: string | null;
  createdAt: Date;
}

export interface AIPlanEditEvent {
  id: string;
  planId: string;
  actorId?: string | null;
  entityType: "PARTICIPANT" | "TASK" | "DEPENDENCY" | "PLAN";
  entityId?: string | null;
  action: "ADD" | "REMOVE" | "UPDATE";
  beforeState?: any;
  afterState?: any;
  reason?: string | null;
  createdAt: Date;
}

// ============================================================
// PROMPT 6 — Joint Closure Engine Domain Types
// ============================================================

export interface CaseClosurePolicy {
  id: string;
  policyCode: string;
  name: string;
  coordinationType: "single_department" | "multi_department" | "emergency";
  severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | null;
  requireAllMandatoryTasks: boolean;
  requireAllHandoffsAccepted: boolean;
  requireNoActiveBlockers: boolean;
  requireNoCriticalEscalations: boolean;
  requireLeadSignoff: boolean;
  requireResponsibleSignoff: boolean;
  requireSupportingSignoff: boolean;
  requireCommissionerApproval: boolean;
  requireCitizenConfirmation: boolean;
  citizenResponseWindowHours: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClosureEligibilityResult {
  eligible: boolean;
  caseId: string;
  caseNumber: string;
  coordinationType: string;
  policyUsed: string;
  missingRequirements: Array<{
    code: string;
    message: string;
    count?: number;
    department?: string;
    required?: number;
    received?: number;
  }>;
  completedRequirements: Array<{
    code: string;
    message: string;
  }>;
  activeBlockers: Array<{
    id: string;
    taskId: string;
    blockerType: string;
    reason: string;
    declaredAt: string;
  }>;
  activeEscalations: Array<{
    id: string;
    severity: string;
    escalationType: string;
    status: string;
    rootCauseDepartment?: string;
  }>;
  evaluatedAt: string;
}

export interface CaseResolutionSignoff {
  id: string;
  caseId: string;
  participationId: string;
  department: string;
  signoffRole: "LEAD" | "RESPONSIBLE" | "SUPPORTING" | "CONSULTED";
  status: "SIGNED" | "REVOKED";
  signedBy?: string | null;
  signedAt: Date;
  statement: string;
  evidenceSummary?: string | null;
  revokedAt?: Date | null;
  revocationReason?: string | null;
  closureCycle: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CaseResolutionPackage {
  id: string;
  caseId: string;
  version: number;
  closureCycle: number;
  status: "ACTIVE" | "HISTORICAL" | "SUPERSEDED";
  generatedAt: Date;
  generatedBy?: string | null;
  summary: string;
  rootCause?: string | null;
  departmentsInvolved: any[];
  completedTasksSnapshot: any[];
  acceptedHandoffsSnapshot: any[];
  evidenceSnapshot: any[];
  slaSnapshot: any;
  escalationSnapshot: any[];
  signoffSnapshot: any[];
  citizenSafeSummary: string;
  policyUsed?: string | null;
  supersedesPackageId?: string | null;
  closedBy?: string | null;
  closedAt?: Date | null;
  createdAt: Date;
}

export interface CaseCitizenConfirmation {
  id: string;
  caseId: string;
  citizenId: string;
  response: "CONFIRMED_RESOLVED" | "STILL_NOT_FIXED" | "PARTIALLY_RESOLVED";
  reasonCode?: string | null;
  comment?: string | null;
  closureCycle: number;
  createdAt: Date;
}

export interface CaseReopenRequest {
  id: string;
  caseId: string;
  requestedBy: string;
  requestSource: "CITIZEN_PORTAL" | "ADMIN_REVIEW" | "DEPARTMENT_FLAG" | "COMMISSIONER_ORDER";
  reasonCode: "ISSUE_PERSISTS" | "ISSUE_RECURRED" | "PARTIAL_RESOLUTION" | "UNSAFE_CONDITION" | "WRONG_LOCATION_FIXED" | "EVIDENCE_DISPUTE" | "OTHER";
  description: string;
  evidenceUrls: string[];
  status: "PENDING" | "APPROVED" | "REJECTED" | "WITHDRAWN";
  reviewedBy?: string | null;
  reviewedAt?: Date | null;
  reviewReason?: string | null;
  closureCycle: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CoordinationMetrics {
  periodFrom: string;
  periodTo: string;
  totalMultiDeptCases: number;
  totalHandoffs: number;
  reworkRatePct: number;
  avgHandoffAcceptanceMinutes: number;
  slaBreachRatePct: number;
  totalEscalations: number;
  reopenRatePct: number;
  firstTimeResolutionRatePct: number;
  totalClosed: number;
}

