import type {
  ActionRequest, ActionRow, AuditRow, BackupRow, RestoreDrillRow, ChangeRequestRow, ConfigPatch, ConfigTemplateRow, EffectiveConfig, RoleDef, RoleDefSave, SchoolConfig, BlueprintInput, BlueprintRow, BuildRow, ConsoleLoginResponse, ConsoleTokens, ConsoleUserRow, ErrorGroup, FleetSummary, FlagRow, InvoiceRowC, LoginRequest,
  CellCreate, CellPatch, ComplianceCreate, ComplianceRow, ComplianceUpdate, MigrationRow, PlanRow, PolicyDoc, ProvisionRunRow, ReleaseRow, SandboxMessage, SchoolDetail, SchoolRow, StepKey, SupportSessionRow, SupportToken, VerifyRequest, WizardDraftRow,
  WizardPayload, WizardReview, EntitlementRow, ImportBatchRow, ImportInput, ImportPreview, MigrationView, ReadinessMark, UploadRow } from '@gradeon/contracts';
import type { Http } from './http';

/** What the console sends to preview or import: the file name may be left out. */
export type ImportInputIn = Omit<ImportInput, 'fileName'> & { fileName?: string };

export interface CellRow { key: string; target: string; region: string; maxSchools: number; schools: number; accepting: boolean }
export interface CatalogDoc { modules: { key: string; name: string; blurb: string; requires: string[]; backend: boolean; core: boolean; state: 'live' | 'beta' | 'planned'; addOnPerStudentYear: number; features: { key: string; name: string; state: 'live' | 'beta' | 'planned' }[] }[]; roleTemplates: { key: string; name: string; description: string; permissions: string[] }[] }

/** Every call the console makes. */
export function consoleApi(h: Http) {
  const base = '/console/v1';
  return {
    login: (b: LoginRequest) => h.post<ConsoleLoginResponse>(`${base}/auth/login`, b),
    verify: (b: VerifyRequest) => h.post<ConsoleTokens>(`${base}/auth/verify`, b),
    logout: () => h.post<void>(`${base}/auth/logout`),
    logoutAll: () => h.post<void>(`${base}/auth/logout-all`),
    fleet: () => h.get<FleetSummary>(`${base}/fleet`),
    errors: (days = 7) => h.get<ErrorGroup[]>(`${base}/errors`, { days }),
    backups: (schoolId: string) => h.get<BackupRow[]>(`${base}/schools/${schoolId}/backups`),
    migration: {
      view: (schoolId: string) => h.get<MigrationView>(`${base}/schools/${schoolId}/import`),
      mark: (schoolId: string, b: ReadinessMark) => h.patch<MigrationView>(`${base}/schools/${schoolId}/import/readiness`, b),
      template: (schoolId: string, kind: string) => h.text(`${base}/schools/${schoolId}/import/template/${kind}`),
      upload: (schoolId: string, uploadId: string) => h.get<{ fileName: string; content: string }>(`${base}/schools/${schoolId}/import/uploads/${uploadId}`),
      setAside: (schoolId: string, uploadId: string) => h.post<UploadRow[]>(`${base}/schools/${schoolId}/import/uploads/${uploadId}/set-aside`),
      preview: (schoolId: string, b: ImportInputIn) => h.post<ImportPreview>(`${base}/schools/${schoolId}/import/preview`, b),
      commit: (schoolId: string, b: ImportInputIn) => h.post<ImportBatchRow>(`${base}/schools/${schoolId}/import/commit`, b),
      undo: (schoolId: string, batchId: string) => h.post<ImportBatchRow[]>(`${base}/schools/${schoolId}/import/batches/${batchId}/undo`),
      exportAll: (schoolId: string) => h.blob(`${base}/schools/${schoolId}/import/export`),
      sample: (schoolId: string, students: number) => h.post<ImportBatchRow[]>(`${base}/schools/${schoolId}/import/sample`, { students }),
    },
    config: {
      get: (schoolId: string) => h.get<SchoolConfig>(`${base}/schools/${schoolId}/config`),
      patch: (schoolId: string, b: ConfigPatch) => h.patch<SchoolConfig | { pending: true; actionId: string }>(`${base}/schools/${schoolId}/config`, b),
      rollback: (schoolId: string, versionId: string) => h.post<SchoolConfig>(`${base}/schools/${schoolId}/config/rollback`, { versionId }),
      preview: (schoolId: string, roleId: string) => h.get<Pick<EffectiveConfig, 'nav' | 'app' | 'modules' | 'school'>>(`${base}/schools/${schoolId}/config/preview`, { roleId }),
      createRole: (schoolId: string, b: RoleDefSave) => h.post<RoleDef[]>(`${base}/schools/${schoolId}/roles`, b),
      saveRole: (schoolId: string, roleId: string, b: RoleDefSave) => h.put<RoleDef[]>(`${base}/schools/${schoolId}/roles/${roleId}`, b),
      deleteRole: (schoolId: string, roleId: string) => h.del<RoleDef[]>(`${base}/schools/${schoolId}/roles/${roleId}`),
      setStaffRole: (schoolId: string, userId: string, roleId: string) => h.put<void>(`${base}/schools/${schoolId}/staff/${userId}/role`, { roleId }),
      templates: () => h.get<ConfigTemplateRow[]>(`${base}/config-templates`),
      saveTemplate: (schoolId: string, name: string) => h.post<ConfigTemplateRow[]>(`${base}/config-templates`, { schoolId, name }),
      applyTemplate: (templateId: string, schoolIds: string[]) => h.post<{ applied: number }>(`${base}/config-templates/${templateId}/apply`, { schoolIds }),
    },
    changeRequests: {
      list: (status: 'open' | 'all' = 'open') => h.get<ChangeRequestRow[]>(`${base}/change-requests`, { status }),
      answer: (id: string, b: { status: 'done' | 'declined'; answer: string }) => h.post<void>(`${base}/change-requests/${id}/answer`, b),
    },
    cells: () => h.get<CellRow[]>(`${base}/cells`),
    createCell: (b: CellCreate) => h.post<{ key: string; note: string }>(`${base}/cells`, b),
    patchCell: (key: string, b: CellPatch) => h.put<{ ok: true }>(`${base}/cells/${key}`, b),
    compliance: {
      list: () => h.get<{ items: ComplianceRow[]; subprocessors: readonly { name: string; purpose: string; region: string }[] }>(`${base}/compliance`),
      create: (b: ComplianceCreate) => h.post<ComplianceRow>(`${base}/compliance`, b),
      update: (id: string, b: ComplianceUpdate) => h.put<ComplianceRow>(`${base}/compliance/${id}`, b),
    },
    probe: () => h.post<{ probed: number }>(`${base}/health/probe`),
    drills: () => h.get<RestoreDrillRow[]>(`${base}/health/restore-drills`),
    runDrill: () => h.post<RestoreDrillRow>(`${base}/health/restore-drills`),
    schools: (q?: { status?: string; query?: string }) => h.get<SchoolRow[]>(`${base}/schools`, q),
    school: (id: string) => h.get<SchoolDetail>(`${base}/schools/${id}`),
    setChecklist: (id: string, key: string, state: 'done' | 'waiting' | 'todo') => h.patch<{ ok: true }>(`${base}/schools/${id}/checklist`, { key, state }),
    plans: () => h.get<PlanRow[]>(`${base}/plans`),
    catalog: () => h.get<CatalogDoc>(`${base}/catalog`),
    entitlements: () => h.get<EntitlementRow[]>(`${base}/entitlements`),
    wizard: {
      drafts: () => h.get<WizardDraftRow[]>(`${base}/wizard/drafts`),
      draft: (id: string) => h.get<WizardDraftRow>(`${base}/wizard/drafts/${id}`),
      createDraft: (b: { name?: string; step?: number; data?: Record<string, unknown> }) => h.post<WizardDraftRow>(`${base}/wizard/drafts`, b),
      saveDraft: (id: string, b: { name?: string; step?: number; data?: Record<string, unknown> }) => h.put<WizardDraftRow>(`${base}/wizard/drafts/${id}`, b),
      deleteDraft: (id: string) => h.del<void>(`${base}/wizard/drafts/${id}`),
      review: (b: WizardPayload) => h.post<WizardReview>(`${base}/wizard/review`, b),
      launch: (b: { payload: WizardPayload; dryRun?: boolean; draftId?: string }) => h.post<ProvisionRunRow>(`${base}/wizard/launch`, b),
    },
    runs: {
      get: (id: string) => h.get<ProvisionRunRow>(`${base}/runs/${id}`),
      retry: (id: string) => h.post<ProvisionRunRow>(`${base}/runs/${id}/retry`),
      skip: (id: string, step: StepKey) => h.post<ProvisionRunRow>(`${base}/runs/${id}/skip/${step}`),
    },
    blueprints: {
      list: () => h.get<BlueprintRow[]>(`${base}/blueprints`),
      save: (b: BlueprintInput) => h.post<BlueprintRow>(`${base}/blueprints`, b),
      activate: (id: string) => h.post<void>(`${base}/blueprints/${id}/activate`),
    },
    policy: { get: () => h.get<PolicyDoc>(`${base}/policy`), set: (b: PolicyDoc) => h.put<PolicyDoc>(`${base}/policy`, b) },
    actions: {
      list: () => h.get<ActionRow[]>(`${base}/actions`),
      request: (b: Partial<ActionRequest> & Pick<ActionRequest, 'action' | 'schoolId'>) => h.post<ActionRow>(`${base}/actions`, b),
      approve: (id: string) => h.post<ActionRow>(`${base}/actions/${id}/approve`),
      reject: (id: string) => h.post<ActionRow>(`${base}/actions/${id}/reject`),
    },
    releases: {
      list: () => h.get<ReleaseRow[]>(`${base}/releases`),
      create: (b: { version: string; notes?: string }) => h.post<ReleaseRow>(`${base}/releases`, b),
      start: (id: string) => h.post<ReleaseRow>(`${base}/releases/${id}/start`),
      pause: (id: string, paused: boolean) => h.post<ReleaseRow>(`${base}/releases/${id}/pause`, { paused }),
      rollback: (id: string) => h.post<ReleaseRow>(`${base}/releases/${id}/rollback`),
      migrations: () => h.get<MigrationRow[]>(`${base}/migrations`),
    },
    builds: () => h.get<BuildRow[]>(`${base}/builds`),
    sandbox: (school?: string) => h.get<SandboxMessage[]>(`${base}/sandbox`, { school }),
    support: {
      list: () => h.get<SupportSessionRow[]>(`${base}/support`),
      start: (schoolId: string, reason: string) => h.post<SupportToken & { session: SupportSessionRow }>(`${base}/support`, { schoolId, reason }),
      end: (id: string) => h.del<void>(`${base}/support/${id}`),
    },
    flags: { list: () => h.get<FlagRow[]>(`${base}/flags`), set: (key: string, b: { enabled: boolean; schoolId?: string | null; label?: string }) => h.put<void>(`${base}/flags/${key}`, b) },
    billing: {
      invoices: () => h.get<InvoiceRowC[]>(`${base}/billing/invoices`),
      generate: (period: string) => h.post<{ created: number }>(`${base}/billing/generate`, { period }),
      setStatus: (id: string, status: string) => h.put<void>(`${base}/billing/invoices/${id}`, { status }),
    },
    team: {
      list: () => h.get<ConsoleUserRow[]>(`${base}/team`),
      add: (b: { name: string; email: string; roles: string[]; password: string }) => h.post<void>(`${base}/team`, b),
      change: (id: string, b: { roles?: string[]; status?: string; password?: string; resetAuthenticator?: boolean }) => h.put<void>(`${base}/team/${id}`, b),
    },
    audit: (school?: string) => h.get<AuditRow[]>(`${base}/audit`, { school }),
  };
}

