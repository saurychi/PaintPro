"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertTriangle,
  ChevronRight,
  Loader2,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { setOptimisticProjectStatus } from "@/lib/jobCreationStatus";
import {
  getCachedMaterials,
  getCachedMainTasks,
  getCachedProjectMeta,
  setCachedMaterials,
  setCachedStep,
  setCachedRefData,
  getCachedRefData,
  ensureWizardCacheHydrated,
  markWizardDirty,
} from "@/lib/wizardCache";
import type {
  CachedMainTask,
  CachedMaterial,
} from "@/lib/wizardCache";
import { toast } from "sonner";
import JobCreationTimeline from "@/components/project-creation/JobCreationTimeline";
import CreateTaskModal from "@/components/project-creation/CreateTaskModal";
import AddMaterialModal from "@/components/project-creation/AddMaterialModal";
import ConfirmDeleteModal from "@/components/project-creation/ConfirmDeleteModal";

type StepStatus = "done" | "active" | "pending";

type MaterialItem = {
  id: string;
  materialId: string;
  name: string;
  quantity: number;
  unitCost: number;
  estimatedCost: number;
  currentStock: number;
  reorderPoint: number;
};

type ServiceGroup = {
  id: string;
  title: string;
  status: StepStatus;
  projectTaskId: string;
  children: MaterialItem[];
};

type MaterialOption = {
  id: string;
  name: string;
  unitCost: number;
  currentStock: number;
  reorderPoint: number;
};

const ACCENT = "#00c065";

function formatCurrency(value: number | null | undefined) {
  const safeValue = Number(value ?? 0);

  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safeValue);
}

type MaterialStockInfo = {
  stock: number;
  reorder: number;
};

type ProjectTaskMaterialApiRow = {
  project_task_material_id?: string;
  project_task_id?: string;
  main_task_id?: string | null;
  main_task_name?: string | null;
  material_id?: string | null;
  material_name?: string | null;
  material_unit_cost?: number | string | null;
  material_current_stock?: number | string | null;
  material_reorder_point?: number | string | null;
  quantity?: number | string | null;
  estimated_cost?: number | string | null;
};

type ProjectTaskApiRow = {
  project_task_id?: string;
  main_task_id?: string | null;
  main_task_name?: string | null;
};

type ProjectTaskMaterialsResponse = {
  error?: string;
  project?: {
    project_code?: string | null;
    title?: string | null;
  } | null;
  projectTasks?: ProjectTaskApiRow[];
  materials?: ProjectTaskMaterialApiRow[];
};

type MaterialCatalogApiRow = {
  id?: string;
  name?: string;
  unit?: string | null;
  unit_cost?: number | string | null;
  current_in_stock?: number | string | null;
  reorder_point?: number | string | null;
};

type ResourceOptionsResponse = {
  error?: string;
  materials?: MaterialCatalogApiRow[];
};

function buildCachedServiceGroups(
  cachedMaterials: CachedMaterial[],
  cachedMainTasks: CachedMainTask[] | null,
) {
  const groupedMap = new Map<string, ServiceGroup>();
  const projectTaskIdToGroupId = new Map<string, string>();

  for (const task of cachedMainTasks ?? []) {
    const projectTaskId = String(task.project_task_id || "").trim();
    const groupId = String(task.id || projectTaskId).trim();
    if (!groupId) continue;

    groupedMap.set(groupId, {
      id: groupId,
      title: task.name || "Main Task",
      status: "pending",
      projectTaskId: projectTaskId || groupId,
      children: [],
    });

    if (projectTaskId) {
      projectTaskIdToGroupId.set(projectTaskId, groupId);
    }
  }

  for (const material of cachedMaterials) {
    const projectTaskId = String(material.projectTaskId || "").trim();
    const groupId = projectTaskIdToGroupId.get(projectTaskId) || projectTaskId;
    if (!groupId) continue;

    const group =
      groupedMap.get(groupId) ??
      {
        id: groupId,
        title: "Main Task",
        status: "pending" as const,
        projectTaskId,
        children: [],
      };

    group.children.push({
      id: material.id,
      materialId: material.materialId,
      name: material.name,
      quantity: material.quantity,
      unitCost: material.unitCost,
      estimatedCost: material.estimatedCost,
      currentStock: 0,
      reorderPoint: 0,
    });

    groupedMap.set(groupId, group);
  }

  return Array.from(groupedMap.values());
}

function buildCatalogStockMap(rows: MaterialCatalogApiRow[]) {
  const stockMap = new Map<string, MaterialStockInfo>();

  for (const row of rows) {
    if (!row.id) continue;

    stockMap.set(row.id, {
      stock: Number(row.current_in_stock ?? 0),
      reorder: Number(row.reorder_point ?? 0),
    });
  }

  return stockMap;
}

function applyMaterialStocks(
  groups: ServiceGroup[],
  stockMap: Map<string, MaterialStockInfo>,
) {
  return groups.map((group) => ({
    ...group,
    children: group.children.map((child) => {
      const stockInfo = stockMap.get(child.materialId);
      if (!stockInfo) return child;

      return {
        ...child,
        currentStock: stockInfo.stock,
        reorderPoint: stockInfo.reorder,
      };
    }),
  }));
}

export default function MaterialsAssignment() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId") || "";

  useEffect(() => {
    router.prefetch("/admin/job-creation/sub-task-assignment");
    router.prefetch("/admin/job-creation/equipment-assignment");
  }, [router]);

  const [services, setServices] = useState<ServiceGroup[]>([]);
  const [loadingMaterials, setLoadingMaterials] = useState(true);
  const [loadingMaterialStocks, setLoadingMaterialStocks] = useState(false);
  const [stockLoadError, setStockLoadError] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [createTaskModalOpen, setCreateTaskModalOpen] = useState(false);
  const [materialModalOpen, setMaterialModalOpen] = useState(false);
  const [activeMainTaskId, setActiveMainTaskId] = useState<string>("");
  const [materialOptions, setMaterialOptions] = useState<MaterialOption[]>([]);
  const [loadingMaterialOptions, setLoadingMaterialOptions] = useState(false);
  const [jobNo, setJobNo] = useState("N/A");
  const [siteName, setSiteName] = useState("Project details unavailable");
  const [isDirty, setIsDirty] = useState(false);
  const [isNavigatingNext, setIsNavigatingNext] = useState(false);
  const [isNavigatingBack, setIsNavigatingBack] = useState(false);
  const [materialPendingDelete, setMaterialPendingDelete] = useState<{
    groupId: string;
    materialRowId: string;
    name: string;
  } | null>(null);
  const [selectedMaterialKeysForDelete, setSelectedMaterialKeysForDelete] =
    useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleteGroupId, setBulkDeleteGroupId] = useState<string | null>(
    null,
  );

  const undoStackRef = useRef<ServiceGroup[][]>([]);
  const redoStackRef = useRef<ServiceGroup[][]>([]);

  // For each unique material across the project, compare the project's total
  // planned quantity to the current inventory stock. Anything where the plan
  // exceeds stock is a "shortage" — the user must restock OR lower the plan
  // before they can move past this step.
  const shortageByMaterialId = useMemo(() => {
    const totals = new Map<
      string,
      {
        materialId: string;
        name: string;
        planned: number;
        currentStock: number;
        reorderPoint: number;
      }
    >();

    for (const group of services) {
      for (const item of group.children) {
        if (!item.materialId) continue;
        const existing = totals.get(item.materialId);
        if (existing) {
          existing.planned += Number(item.quantity ?? 0);
        } else {
          totals.set(item.materialId, {
            materialId: item.materialId,
            name: item.name,
            planned: Number(item.quantity ?? 0),
            currentStock: Number(item.currentStock ?? 0),
            reorderPoint: Number(item.reorderPoint ?? 0),
          });
        }
      }
    }

    const shortMap = new Map<
      string,
      {
        materialId: string;
        name: string;
        planned: number;
        currentStock: number;
        deficit: number;
      }
    >();

    for (const entry of totals.values()) {
      const deficit = entry.planned - entry.currentStock;
      if (deficit > 0) {
        shortMap.set(entry.materialId, {
          materialId: entry.materialId,
          name: entry.name,
          planned: entry.planned,
          currentStock: entry.currentStock,
          deficit,
        });
      }
    }

    return shortMap;
  }, [services]);

  const shortages = useMemo(
    () => Array.from(shortageByMaterialId.values()),
    [shortageByMaterialId],
  );
  const hasShortage = shortages.length > 0;

  // If any shortage material has zero stock, the user can't redistribute their
  // way out — there's literally nothing to spread across the rows. They have
  // to restock first (or remove the material from the project).
  const hasZeroStockShortage = shortages.some(
    (shortage) => shortage.currentStock <= 0,
  );
  const canDisregard = hasShortage && !hasZeroStockShortage;
  const canEvaluateMaterialStock =
    !loadingMaterials && !loadingMaterialStocks && !stockLoadError;
  const showShortageWarning = canEvaluateMaterialStock && hasShortage;

  const [requestingRestock, setRequestingRestock] = useState(false);
  const [restockRequestedAt, setRestockRequestedAt] = useState<number | null>(
    null,
  );

  // Bulk-delete selections are scoped per main task: we group the selected
  // "groupId::rowId" keys by their groupId so each main task's "Remove (N)"
  // button only counts and removes its own children.
  const selectedKeysByGroup = useMemo(() => {
    const byGroup = new Map<string, Set<string>>();
    for (const key of selectedMaterialKeysForDelete) {
      const [groupId] = key.split("::");
      if (!groupId) continue;
      const set = byGroup.get(groupId) ?? new Set<string>();
      set.add(key);
      byGroup.set(groupId, set);
    }
    return byGroup;
  }, [selectedMaterialKeysForDelete]);

  const bulkDeleteKeys = bulkDeleteGroupId
    ? (selectedKeysByGroup.get(bulkDeleteGroupId) ?? new Set<string>())
    : new Set<string>();

  function cloneServicesState(value: ServiceGroup[]) {
    return value.map((group) => ({
      ...group,
      children: group.children.map((item) => ({ ...item })),
    }));
  }

  function updateServicesWithHistory(
    updater: (prev: ServiceGroup[]) => ServiceGroup[],
  ) {
    setServices((prev) => {
      const prevSnapshot = cloneServicesState(prev);
      const next = updater(prev);
      const nextSnapshot = cloneServicesState(next);

      if (JSON.stringify(prevSnapshot) !== JSON.stringify(nextSnapshot)) {
        undoStackRef.current.push(prevSnapshot);
        redoStackRef.current = [];
      }

      return next;
    });
  }

  const handleUndoServices = useCallback(() => {
    if (undoStackRef.current.length === 0) return;

    setServices((current) => {
      const currentSnapshot = cloneServicesState(current);
      const previousSnapshot = undoStackRef.current.pop();

      if (!previousSnapshot) return current;

      redoStackRef.current.push(currentSnapshot);
      return previousSnapshot;
    });
  }, []);

  const loadProjectTaskMaterials = useCallback(async () => {
    if (!projectId) {
      setLoadingMaterials(false);
      return;
    }

    try {
      setLoadingMaterials(true);
      setLoadingMaterialStocks(false);
      setStockLoadError(false);

      await ensureWizardCacheHydrated(projectId);

      // ── Cache-first: check wizard cache for materials ──
      const cachedMaterials = getCachedMaterials(projectId);
      const cachedMainTasks = getCachedMainTasks(projectId);
      const cachedProjectMeta = getCachedProjectMeta(projectId);

      if (cachedProjectMeta) {
        setJobNo(cachedProjectMeta.projectCode || "N/A");
        setSiteName(
          cachedProjectMeta.projectTitle || "Project details unavailable",
        );
      }

      if (cachedMaterials && cachedMaterials.length > 0) {
        // Show cached materials immediately, then refresh only the live stock
        // fields so the user can see progress while inventory data loads.
        const groupedServices = buildCachedServiceGroups(
          cachedMaterials,
          cachedMainTasks,
        );

        setServices(groupedServices);
        setExpanded(new Set(groupedServices.map((group) => group.id)));
        setIsDirty(false);
        setSelectedMaterialKeysForDelete(new Set());
        undoStackRef.current = [];
        redoStackRef.current = [];

        setLoadingMaterials(false);
        setLoadingMaterialStocks(true);

        try {
          const response = await fetch(
            "/api/planning/getSubTaskResourceOptions",
            { cache: "no-store" },
          );
          const data = (await response.json()) as ResourceOptionsResponse;

          if (!response.ok) {
            throw new Error(data?.error || "Failed to load material stock.");
          }

          const materialRows = Array.isArray(data?.materials)
            ? data.materials
            : [];
          const stockMap = buildCatalogStockMap(materialRows);

          setServices((prev) => applyMaterialStocks(prev, stockMap));
          setCachedRefData(projectId, {
            materialCatalog: materialRows.map((item) => ({
              material_id: item.id ?? "",
              name: item.name ?? "Material",
              unit: item.unit ?? null,
              unit_cost: Number(item.unit_cost ?? 0),
              current_stock: Number(item.current_in_stock ?? 0),
              current_in_stock: Number(item.current_in_stock ?? 0),
              reorder_point: Number(item.reorder_point ?? 0),
            })),
          });
          setStockLoadError(false);
        } catch (error: unknown) {
          setStockLoadError(true);
          toast.error(
            (error instanceof Error ? error.message : "") ||
              "Materials loaded from cache, but stock levels could not be refreshed.",
          );
        } finally {
          setLoadingMaterialStocks(false);
        }

        return;
      }

      // ── Cache miss: fetch everything from API ──
      const response = await fetch(
        `/api/planning/getProjectTaskMaterials?projectId=${projectId}`,
        { cache: "no-store" },
      );
      const data = (await response.json()) as ProjectTaskMaterialsResponse;

      if (!response.ok) {
        throw new Error(data?.error || "Failed to load project materials.");
      }

      setJobNo(data?.project?.project_code || "N/A");
      setSiteName(data?.project?.title || "Project details unavailable");

      const rows = Array.isArray(data?.materials) ? data.materials : [];
      const projectTasks = Array.isArray(data?.projectTasks)
        ? data.projectTasks
        : [];

      const groupedMap = new Map<string, ServiceGroup>();

      for (const row of projectTasks) {
        const projectTaskId = row.project_task_id ?? "";
        const groupId = row.main_task_id || projectTaskId;
        if (!groupId || !projectTaskId) continue;

        groupedMap.set(groupId, {
          id: groupId,
          title: row.main_task_name || "Main Task",
          status: "pending",
          projectTaskId,
          children: [],
        });
      }

      for (const row of rows) {
        const projectTaskId = row.project_task_id ?? "";
        const groupId = row.main_task_id || projectTaskId;
        if (!groupId || !projectTaskId) continue;

        const materialRowId =
          row.project_task_material_id ||
          `material_${projectTaskId}_${row.material_id ?? "unknown"}`;
        const existingGroup = groupedMap.get(groupId);

        if (existingGroup) {
          existingGroup.children.push({
            id: materialRowId,
            materialId: row.material_id ?? "",
            name: row.material_name || "Material",
            quantity: Number(row.quantity ?? 0),
            unitCost: Number(row.material_unit_cost ?? 0),
            estimatedCost: Number(row.estimated_cost ?? 0),
            currentStock: Number(row.material_current_stock ?? 0),
            reorderPoint: Number(row.material_reorder_point ?? 0),
          });
          continue;
        }

        groupedMap.set(groupId, {
          id: groupId,
          title: row.main_task_name || "Main Task",
          status: "pending",
          projectTaskId,
          children: [
            {
              id: materialRowId,
              materialId: row.material_id ?? "",
              name: row.material_name || "Material",
              quantity: Number(row.quantity ?? 0),
              unitCost: Number(row.material_unit_cost ?? 0),
              estimatedCost: Number(row.estimated_cost ?? 0),
              currentStock: Number(row.material_current_stock ?? 0),
              reorderPoint: Number(row.material_reorder_point ?? 0),
            },
          ],
        });
      }

      const groupedServices = Array.from(groupedMap.values());

      // Cache the materials for future visits
      const materialsToCache: CachedMaterial[] = [];
      for (const group of groupedServices) {
        for (const child of group.children) {
          materialsToCache.push({
            id: child.id,
            projectTaskId: group.projectTaskId,
            materialId: child.materialId,
            name: child.name,
            unit: null,
            quantity: child.quantity,
            unitCost: child.unitCost,
            estimatedCost: child.estimatedCost,
          });
        }
      }
      setCachedMaterials(projectId, materialsToCache);

      setServices(groupedServices);
      setExpanded(new Set(groupedServices.map((group) => group.id)));
      // Reload is a fresh source-of-truth: drop any pending dirty edits, undo
      // history, and bulk-delete selections so the page reflects the server.
      setIsDirty(false);
      setSelectedMaterialKeysForDelete(new Set());
      undoStackRef.current = [];
      redoStackRef.current = [];
    } catch (error: unknown) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to load project materials.",
      );
      throw error;
    } finally {
      setLoadingMaterials(false);
      setLoadingMaterialStocks(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadProjectTaskMaterials();
  }, [loadProjectTaskMaterials]);

  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    if (refreshing) return;
    if (
      isDirty &&
      !window.confirm(
        "You have unsaved changes. Refresh anyway and discard them?",
      )
    ) {
      return;
    }
    setRefreshing(true);
    try {
      await loadProjectTaskMaterials();
      toast.success("Materials refreshed.");
    } catch {
      // toast already shown in loader
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();

      const isTypingElement =
        tagName === "input" ||
        tagName === "textarea" ||
        target?.isContentEditable;

      if (isTypingElement) return;

      const isUndoShortcut =
        (event.ctrlKey || event.metaKey) &&
        !event.shiftKey &&
        event.key.toLowerCase() === "z";

      if (!isUndoShortcut) return;

      event.preventDefault();
      handleUndoServices();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleUndoServices]);

  function toggleGroup(groupId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  function handleOpenCreateTaskModal() {
    setCreateTaskModalOpen(true);
  }

  function handleCloseCreateTaskModal() {
    setCreateTaskModalOpen(false);
  }

  async function handleCreateTask(payload: {
    name: string;
    sortOrder: string;
    subTasks: {
      description: string;
      sortOrder: string;
      materialIds: string[];
      equipmentIds: string[];
    }[];
  }) {
    void payload;
    setCreateTaskModalOpen(false);
  }

  async function handleOpenAddMaterialModal(groupId: string) {
    setActiveMainTaskId(groupId);
    setMaterialModalOpen(true);

    try {
      setLoadingMaterialOptions(true);

      // ── Cache-first: check wizard cache for material catalog ──
      const cachedRef = getCachedRefData(projectId);
      if (cachedRef?.materialCatalog && cachedRef.materialCatalog.length > 0) {
        const options: MaterialOption[] = cachedRef.materialCatalog.map(
          (item) => ({
            id: item.material_id,
            name: item.name,
            unitCost: Number(item.unit_cost ?? 0),
            currentStock: Number(
              item.current_stock ?? item.current_in_stock ?? 0,
            ),
            reorderPoint: Number(item.reorder_point ?? 0),
          }),
        );
        setMaterialOptions(options);
        setLoadingMaterialOptions(false);
        return;
      }

      // ── Cache miss: fetch from API and cache ──
      const response = await fetch("/api/planning/getSubTaskResourceOptions");
      const data = (await response.json()) as ResourceOptionsResponse;

      if (!response.ok) {
        throw new Error(data?.error || "Failed to load material options.");
      }

      const rawMaterials = Array.isArray(data?.materials)
        ? data.materials
        : [];

      const options: MaterialOption[] = rawMaterials.map((item) => ({
        id: item.id ?? "",
        name: item.name ?? "Material",
        unitCost: Number(item.unit_cost ?? 0),
        currentStock: Number(item.current_in_stock ?? 0),
        reorderPoint: Number(item.reorder_point ?? 0),
      }));

      // Cache the material catalog for future use
      setCachedRefData(projectId, {
        materialCatalog: rawMaterials.map((item) => ({
          material_id: item.id ?? "",
          name: item.name ?? "Material",
          unit: item.unit ?? null,
          unit_cost: Number(item.unit_cost ?? 0),
          current_stock: Number(item.current_in_stock ?? 0),
          reorder_point: Number(item.reorder_point ?? 0),
        })),
      });

      setMaterialOptions(options);
    } catch (error: unknown) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to load material options.",
      );
    } finally {
      setLoadingMaterialOptions(false);
    }
  }

  function handleCloseAddMaterialModal() {
    setMaterialModalOpen(false);
    setActiveMainTaskId("");
  }

  function handleRemoveMaterialFromActiveGroup(materialRowId: string) {
    if (!activeMainTaskId) {
      toast.error("No main task selected.");
      return;
    }

    const material = services
      .find((group) => group.id === activeMainTaskId)
      ?.children.find((item) => item.id === materialRowId);

    setMaterialPendingDelete({
      groupId: activeMainTaskId,
      materialRowId,
      name: material?.name || "this material",
    });
  }

  function handleAddMaterialToGroup(
    material: MaterialOption,
    quantity: number,
  ) {
    if (!activeMainTaskId) {
      toast.error("No main task selected.");
      return;
    }

    const safeQuantity = Number(quantity);
    if (!Number.isFinite(safeQuantity) || safeQuantity <= 0) {
      toast.error("Quantity must be greater than 0.");
      return;
    }

    const estimatedCost = Number(material.unitCost || 0) * safeQuantity;

    updateServicesWithHistory((prev) =>
      prev.map((group) => {
        if (group.id !== activeMainTaskId) return group;

        return {
          ...group,
          children: [
            ...group.children,
            {
              id: `local_${material.id}_${Date.now()}`,
              materialId: material.id,
              name: material.name,
              quantity: safeQuantity,
              unitCost: Number(material.unitCost || 0),
              estimatedCost,
              currentStock: Number(material.currentStock || 0),
              reorderPoint: Number(material.reorderPoint || 0),
            },
          ],
        };
      }),
    );

    setExpanded((prev) => new Set(prev).add(activeMainTaskId));
    setIsDirty(true); markWizardDirty(projectId);
  }

  function handleUpdateMaterialQuantity(
    groupId: string,
    materialRowId: string,
    quantity: number,
  ) {
    const safeQuantity = Number(quantity);
    if (!Number.isFinite(safeQuantity)) return;

    const normalizedQuantity = Math.max(1, safeQuantity || 1);

    updateServicesWithHistory((prev) =>
      prev.map((group) => {
        if (group.id !== groupId) return group;

        return {
          ...group,
          children: group.children.map((item) => {
            if (item.id !== materialRowId) return item;

            return {
              ...item,
              quantity: normalizedQuantity,
              estimatedCost: Number(item.unitCost || 0) * normalizedQuantity,
            };
          }),
        };
      }),
    );

    setIsDirty(true); markWizardDirty(projectId);
  }

  function handleRemoveMaterialFromGroup(groupId: string, materialRowId: string) {
    updateServicesWithHistory((prev) =>
      prev.map((group) => {
        if (group.id !== groupId) return group;

        return {
          ...group,
          children: group.children.filter((item) => item.id !== materialRowId),
        };
      }),
    );

    setSelectedMaterialKeysForDelete((prev) => {
      const next = new Set(prev);
      next.delete(`${groupId}::${materialRowId}`);
      return next;
    });
    setIsDirty(true); markWizardDirty(projectId);
    toast.success("Material removed.");
  }

  function handleRemoveSelectedMaterials(keys: Set<string>) {
    if (keys.size === 0) return;

    updateServicesWithHistory((prev) =>
      prev.map((group) => ({
        ...group,
        children: group.children.filter(
          (item) => !keys.has(`${group.id}::${item.id}`),
        ),
      })),
    );

    // Drop only the keys we just deleted from the global selection — leave
    // selections in other main tasks intact so each group keeps its own
    // bulk-delete scope.
    setSelectedMaterialKeysForDelete((prev) => {
      const next = new Set(prev);
      for (const key of keys) next.delete(key);
      return next;
    });
    setIsDirty(true); markWizardDirty(projectId);
    toast.success("Selected materials removed.");
  }

  function toggleMaterialDeleteSelection(groupId: string, materialRowId: string) {
    const key = `${groupId}::${materialRowId}`;
    setSelectedMaterialKeysForDelete((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Mark every shortage material as needing reorder so the inventory team can
  // act on it. Doesn't change the project's planned quantities — the user must
  // still restock or redistribute before they can move past this step.
  async function handleRequestRestock() {
    if (requestingRestock || shortages.length === 0) return;
    setRequestingRestock(true);
    try {
      const response = await fetch("/api/materials/markForReorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: shortages.map((shortage) => ({
            materialId: shortage.materialId,
            neededStock: shortage.deficit,
          })),
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok && response.status !== 207) {
        throw new Error(data?.error || "Failed to request restock.");
      }

      setRestockRequestedAt(Date.now());
      toast.success(
        `Requested restock for ${shortages.length} material${
          shortages.length === 1 ? "" : "s"
        }.`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to request restock.",
      );
    } finally {
      setRequestingRestock(false);
    }
  }

  // Distribute the available stock evenly across every row that uses a short
  // material. Each row gets floor(stock / rowCount), with the remainder going
  // to the first few rows so the totals add up exactly. Disabled when any
  // short material has zero stock — there's nothing to split.
  function handleUseAvailable() {
    if (!canDisregard) return;

    // Build a per-material list of {groupId, rowId, currentStock}.
    const rowsByMaterial = new Map<
      string,
      Array<{ groupId: string; rowId: string }>
    >();
    for (const group of services) {
      for (const item of group.children) {
        if (!item.materialId) continue;
        if (!shortageByMaterialId.has(item.materialId)) continue;
        const list = rowsByMaterial.get(item.materialId) ?? [];
        list.push({ groupId: group.id, rowId: item.id });
        rowsByMaterial.set(item.materialId, list);
      }
    }

    // For each material, compute the new per-row quantity.
    const newQuantityByKey = new Map<string, number>();
    for (const shortage of shortages) {
      const rows = rowsByMaterial.get(shortage.materialId) ?? [];
      if (rows.length === 0) continue;
      const stock = Math.max(0, shortage.currentStock);
      const baseQty = Math.floor(stock / rows.length);
      const remainder = stock - baseQty * rows.length;
      rows.forEach((row, index) => {
        const qty = baseQty + (index < remainder ? 1 : 0);
        newQuantityByKey.set(`${row.groupId}::${row.rowId}`, qty);
      });
    }

    updateServicesWithHistory((prev) =>
      prev.map((group) => ({
        ...group,
        children: group.children.map((item) => {
          const next = newQuantityByKey.get(`${group.id}::${item.id}`);
          if (next === undefined) return item;
          return {
            ...item,
            quantity: next,
            estimatedCost: Number(item.unitCost || 0) * next,
          };
        }),
      })),
    );

    setIsDirty(true); markWizardDirty(projectId);
    toast.success("Quantities redistributed to fit available stock.");
  }

  function saveMaterialsToCache() {
    const materialsToCache: CachedMaterial[] = [];
    for (const group of services) {
      for (const item of group.children) {
        materialsToCache.push({
          id: item.id,
          projectTaskId: group.projectTaskId,
          materialId: item.materialId,
          name: item.name,
          unit: null,
          quantity: item.quantity,
          unitCost: item.unitCost,
          estimatedCost: item.estimatedCost,
        });
      }
    }
    setCachedMaterials(projectId, materialsToCache);
    setIsDirty(false);
  }

  function handleNext() {
    setIsNavigatingNext(true);
    saveMaterialsToCache();
    setCachedStep(projectId, "equipment_pending");
    setOptimisticProjectStatus(projectId, "equipment_pending");
    router.push(`/admin/job-creation/equipment-assignment?projectId=${projectId}`);
  }

  function handleGoBack() {
    setIsNavigatingBack(true);
    saveMaterialsToCache();
    setCachedStep(projectId, "sub_task_pending");
    setOptimisticProjectStatus(projectId, "sub_task_pending");
    router.push(`/admin/job-creation/sub-task-assignment?projectId=${projectId}`);
  }

  return (
    <div className="w-full h-screen overflow-hidden bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100">
      <div className="flex h-full flex-col gap-3 overflow-hidden px-6 pt-5 pb-4">
        <div className="flex items-center gap-2 text-[18px] font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
          <span>Project</span>
          <ChevronRight
            className="h-5 w-5 text-slate-300 dark:text-slate-500 shrink-0"
            aria-hidden
          />
          <span>Materials</span>
        </div>

        <div className="grid flex-1 min-h-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
            <div
              className="h-1 w-full shrink-0"
              style={{ backgroundColor: ACCENT }}
            />

            <div className="shrink-0 border-b border-slate-200 dark:border-slate-700 px-5 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: ACCENT }}
                      aria-hidden="true"
                    />
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Materials Assignment
                    </p>
                  </div>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    Review and organize materials under each main task.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleRefresh()}
                    disabled={refreshing || loadingMaterials || loadingMaterialStocks}
                    title={
                      isDirty
                        ? "Refresh will discard unsaved changes."
                        : undefined
                    }
                    className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
                    />
                    Refresh
                  </button>

                  <div className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-600 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300">
                    Task Setup
                  </div>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden px-3 py-2.5">
              <div className="h-full overflow-y-auto pr-2 green-scrollbar">
                {loadingMaterialStocks ? (
                  <div className="mb-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[13px] text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                      <span className="font-semibold">
                        Materials loaded from cache. Checking current stock...
                      </span>
                    </div>
                  </div>
                ) : null}

                {stockLoadError ? (
                  <div className="mb-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <div>
                        <div className="font-semibold">
                          Stock levels could not be refreshed
                        </div>
                        <div className="mt-1 text-[12px] leading-5">
                          Refresh this step before continuing so shortages are
                          checked against live inventory.
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}

                {showShortageWarning ? (
                  <div className="mb-2.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold">
                          Not enough stock to start this project
                        </div>
                        <div className="mt-1 text-[12px] leading-5">
                          {hasZeroStockShortage
                            ? "Some materials have zero stock — restock them before continuing. Lowering the project quantity won't help here."
                            : "Restock these materials, lower the planned quantity, or use the actions below to resolve."}
                        </div>
                        <ul className="mt-1.5 space-y-0.5 text-[12px] leading-5">
                          {shortages.map((shortage) => (
                            <li
                              key={shortage.materialId}
                              className="flex flex-wrap items-center gap-x-2"
                            >
                              <span className="font-medium">
                                {shortage.name}
                              </span>
                              <span className="text-red-700 dark:text-red-300">
                                — needs {shortage.deficit} more (planned{" "}
                                {shortage.planned}, in stock{" "}
                                {shortage.currentStock})
                              </span>
                              {shortage.currentStock <= 0 ? (
                                <span className="rounded-full border border-red-300 bg-white/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700 dark:border-red-400/40 dark:bg-red-500/10 dark:text-red-200">
                                  zero stock
                                </span>
                              ) : null}
                            </li>
                          ))}
                        </ul>

                        <div className="mt-2.5 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void handleRequestRestock()}
                            disabled={requestingRestock}
                            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-red-300 bg-white px-3 text-[12px] font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-400/50 dark:bg-slate-900 dark:text-red-200 dark:hover:bg-red-500/15"
                          >
                            {requestingRestock ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : null}
                            Request restock
                          </button>

                          <button
                            type="button"
                            onClick={handleUseAvailable}
                            disabled={!canDisregard}
                            title={
                              !canDisregard
                                ? "Can't redistribute — at least one short material has zero stock."
                                : "Spread the available stock evenly across rows that use each short material."
                            }
                            className="inline-flex h-8 items-center justify-center rounded-md border border-red-300 bg-white px-3 text-[12px] font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-400/50 dark:bg-slate-900 dark:text-red-200 dark:hover:bg-red-500/15"
                          >
                            Use available stock
                          </button>

                          {restockRequestedAt ? (
                            <span className="text-[11px] font-medium text-red-600 dark:text-red-300">
                              Restock requested.
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
                <div className="space-y-2.5">
                  {loadingMaterials ? (
                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-4 text-sm text-slate-500 dark:text-slate-400">
                      Loading materials...
                    </div>
                  ) : services.length === 0 ? (
                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-4 text-sm text-slate-500 dark:text-slate-400">
                      No materials found for this project.
                    </div>
                  ) : (
                    services.map((group) => {
                      const isOpen = expanded.has(group.id);

                      return (
                        <div
                          key={group.id}
                          className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                        >
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => toggleGroup(group.id)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                toggleGroup(group.id);
                              }
                            }}
                            className={`w-full cursor-pointer px-4 py-3 text-left transition ${
                              isOpen ? "bg-emerald-50/40 dark:bg-emerald-500/10" : "bg-white dark:bg-slate-900"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex min-w-0 items-center gap-3">
                                <div
                                  className={`h-9 w-1 rounded-full ${
                                    isOpen ? "opacity-100" : "opacity-0"
                                  }`}
                                  style={{ backgroundColor: ACCENT }}
                                />

                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="truncate text-[13px] font-semibold text-slate-900 dark:text-slate-100">
                                      {group.title}
                                    </span>

                                    {isOpen && (
                                      <span className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300">
                                        MAIN TASK
                                      </span>
                                    )}
                                  </div>

                                  <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                                    {group.children.length} item
                                    {group.children.length === 1 ? "" : "s"}
                                  </div>
                                </div>
                              </div>

                              <div className="flex shrink-0 items-center gap-2">
                                {(selectedKeysByGroup.get(group.id)?.size ?? 0) >
                                0 ? (
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setBulkDeleteGroupId(group.id);
                                      setBulkDeleteOpen(true);
                                    }}
                                    className="inline-flex h-8 items-center justify-center rounded-md border border-rose-200 bg-rose-50 px-2.5 text-[11px] font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20"
                                  >
                                    Remove (
                                    {selectedKeysByGroup.get(group.id)?.size ?? 0}
                                    )
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleOpenAddMaterialModal(group.id);
                                  }}
                                  className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 text-[11px] font-semibold text-emerald-600 transition hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300 dark:hover:bg-emerald-500/25"
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                  Add Material
                                </button>
                              </div>
                            </div>
                          </div>

                          {isOpen && (
                            <div className="px-5 pb-4">
                              {group.children.length === 0 ? (
                                <div className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-[13px] text-slate-500 dark:text-slate-400">
                                  No materials found for this main task.
                                </div>
                              ) : (
                                <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                                  <div className="divide-y divide-slate-200 dark:divide-slate-800">
                                    {group.children.map((item) => (
                                      <div key={item.id} className="px-4 py-3">
                                        <div className="grid grid-cols-1 gap-3 text-[13px] md:grid-cols-[32px_minmax(0,1fr)_130px_120px_150px_40px] md:items-end">
                                          <label className="flex h-9 items-center md:justify-center">
                                            <input
                                              type="checkbox"
                                              checked={selectedMaterialKeysForDelete.has(
                                                `${group.id}::${item.id}`,
                                              )}
                                              onChange={() =>
                                                toggleMaterialDeleteSelection(
                                                  group.id,
                                                  item.id,
                                                )
                                              }
                                              className="h-4 w-4 rounded border-slate-300 bg-transparent accent-[#00c065] dark:border-slate-600 dark:bg-transparent"
                                              aria-label={`Select ${item.name} for deletion`}
                                            />
                                          </label>
                                          <div className="min-w-0">
                                            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                              Material
                                            </div>
                                            <div className="flex flex-wrap items-center gap-2">
                                              <span className="truncate font-medium text-slate-900 dark:text-slate-100">
                                                {item.name}
                                              </span>
                                              {(() => {
                                                if (loadingMaterialStocks) {
                                                  return (
                                                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                                                      <Loader2 className="h-3 w-3 animate-spin" />
                                                      Checking stock
                                                    </span>
                                                  );
                                                }

                                                if (stockLoadError) {
                                                  return (
                                                    <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                                                      Stock unavailable
                                                    </span>
                                                  );
                                                }

                                                const shortage =
                                                  item.materialId
                                                    ? shortageByMaterialId.get(
                                                        item.materialId,
                                                      )
                                                    : undefined;
                                                if (shortage) {
                                                  return (
                                                    <span
                                                      className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700"
                                                      title={`Project plans ${shortage.planned} but only ${shortage.currentStock} in stock. Restock ${shortage.deficit} or lower the planned quantity.`}
                                                    >
                                                      Needs {shortage.deficit}{" "}
                                                      more (stock{" "}
                                                      {shortage.currentStock})
                                                    </span>
                                                  );
                                                }
                                                const stock = item.currentStock;
                                                const reorder =
                                                  item.reorderPoint;
                                                if (
                                                  reorder > 0 &&
                                                  stock <= reorder
                                                ) {
                                                  return (
                                                    <span
                                                      className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700"
                                                      title={`Stock ${stock} at or below reorder point ${reorder}.`}
                                                    >
                                                      Low stock ({stock})
                                                    </span>
                                                  );
                                                }
                                                return (
                                                  <span className="text-[10px] text-slate-400">
                                                    Stock {stock}
                                                  </span>
                                                );
                                              })()}
                                            </div>
                                          </div>

                                          <div className="md:text-right">
                                            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                              Unit Cost
                                            </div>
                                            <div className="font-medium text-slate-800 dark:text-slate-100">
                                              {formatCurrency(item.unitCost)}
                                            </div>
                                          </div>

                                          <div>
                                            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                              Quantity
                                            </div>
                                            <input
                                              type="number"
                                              min="1"
                                              step="1"
                                              inputMode="numeric"
                                              value={item.quantity}
                                              onChange={(event) =>
                                                handleUpdateMaterialQuantity(
                                                  group.id,
                                                  item.id,
                                                  Number(event.target.value),
                                                )
                                              }
                                              className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-[13px] text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/10 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                                            />
                                          </div>

                                          <div className="md:text-right">
                                            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                              Estimated Cost
                                            </div>
                                            <div className="font-medium text-slate-800 dark:text-slate-100">
                                              {formatCurrency(item.estimatedCost)}
                                            </div>
                                          </div>

                                          <div className="flex md:justify-end">
                                            <button
                                              type="button"
                                              onClick={() =>
                                                setMaterialPendingDelete({
                                                  groupId: group.id,
                                                  materialRowId: item.id,
                                                  name: item.name,
                                                })
                                              }
                                              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-500 transition hover:bg-red-100 hover:text-red-600 active:scale-95 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20 dark:hover:text-red-200"
                                              aria-label={`Remove ${item.name}`}
                                              title="Remove material"
                                            >
                                              <X className="h-4 w-4" />
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </section>

          <aside className="h-full min-h-0 flex flex-col gap-4">
            <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
              <div className="px-4 py-4">
                <div className="text-[16px] font-semibold text-slate-900 dark:text-slate-100">
                  {jobNo}
                </div>
                <div className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">{siteName}</div>
              </div>

              <div className="border-t border-slate-200 dark:border-slate-700 px-4 py-4">
                <button
                  type="button"
                  onClick={handleOpenCreateTaskModal}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[12px] font-semibold text-emerald-600 transition hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300 dark:hover:bg-emerald-500/25"
                >
                  <Plus className="h-4 w-4" />
                  Create Task
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1">
              <JobCreationTimeline currentStep="materials" />
            </div>
          </aside>
        </div>

        <div className="shrink-0 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleGoBack}
            disabled={isNavigatingBack}
            className="inline-flex h-10 w-28 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-[13px] font-medium text-slate-700 transition duration-150 hover:bg-slate-50 hover:opacity-80 active:scale-95 disabled:cursor-not-allowed disabled:opacity-70 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {isNavigatingBack ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Go Back"
            )}
          </button>

          <button
            type="button"
            onClick={handleNext}
            disabled={
              isNavigatingNext ||
              refreshing ||
              loadingMaterials ||
              loadingMaterialStocks ||
              stockLoadError ||
              hasShortage
            }
            title={
              loadingMaterials || refreshing
                ? "Loading project materials."
                : loadingMaterialStocks
                  ? "Checking material stock before continuing."
                  : stockLoadError
                    ? "Refresh stock levels before continuing."
                    : hasShortage
                ? "Resolve the material shortage above before continuing."
                : undefined
            }
            className="inline-flex h-10 w-28 items-center justify-center gap-2 rounded-md px-4 text-[13px] font-semibold text-white transition duration-150 hover:opacity-85 active:scale-95 disabled:cursor-not-allowed disabled:opacity-70"
            style={{ backgroundColor: ACCENT }}
          >
            {isNavigatingNext ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading...
              </>
            ) : (
              "Next"
            )}
          </button>
        </div>
      </div>


      <CreateTaskModal
        open={createTaskModalOpen}
        onClose={handleCloseCreateTaskModal}
        onSave={handleCreateTask}
      />

      <AddMaterialModal
        open={materialModalOpen}
        mainTaskTitle={
          services.find((group) => group.id === activeMainTaskId)?.title ||
          "Main Task"
        }
        existingMaterials={
          services.find((group) => group.id === activeMainTaskId)?.children ||
          []
        }
        materialOptions={materialOptions}
        loadingOptions={loadingMaterialOptions}
        onClose={handleCloseAddMaterialModal}
        onAddMaterial={handleAddMaterialToGroup}
        onRemoveMaterial={handleRemoveMaterialFromActiveGroup}
      />

      <ConfirmDeleteModal
        open={Boolean(materialPendingDelete)}
        title="Remove material?"
        description={
          materialPendingDelete
            ? `Remove "${materialPendingDelete.name}" from this main task?`
            : "Remove this material from this main task?"
        }
        confirmLabel="Remove"
        onCancel={() => setMaterialPendingDelete(null)}
        onConfirm={() => {
          if (materialPendingDelete) {
            handleRemoveMaterialFromGroup(
              materialPendingDelete.groupId,
              materialPendingDelete.materialRowId,
            );
          }
          setMaterialPendingDelete(null);
        }}
      />

      <ConfirmDeleteModal
        open={bulkDeleteOpen}
        title="Remove selected materials?"
        description={`Remove ${bulkDeleteKeys.size} selected material${
          bulkDeleteKeys.size === 1 ? "" : "s"
        } from this main task?`}
        confirmLabel="Remove selected"
        onCancel={() => {
          setBulkDeleteOpen(false);
          setBulkDeleteGroupId(null);
        }}
        onConfirm={() => {
          handleRemoveSelectedMaterials(bulkDeleteKeys);
          setBulkDeleteOpen(false);
          setBulkDeleteGroupId(null);
        }}
      />

      <style jsx global>{`
        .green-scrollbar::-webkit-scrollbar {
          width: 10px;
        }
        .green-scrollbar::-webkit-scrollbar-track {
          background: #eaf7e4;
          border-radius: 999px;
        }
        .dark .green-scrollbar::-webkit-scrollbar-track {
          background: #0f172a;
        }
        .green-scrollbar::-webkit-scrollbar-thumb {
          background: ${ACCENT};
          border-radius: 999px;
          border: 2px solid #eaf7e4;
        }
        .dark .green-scrollbar::-webkit-scrollbar-thumb {
          border-color: #0f172a;
        }
        .green-scrollbar {
          scrollbar-color: ${ACCENT} #eaf7e4;
          scrollbar-width: thin;
        }
        .dark .green-scrollbar {
          scrollbar-color: ${ACCENT} #0f172a;
        }

        .dark .fixed.inset-0 button[class*="bg-white"],
        .dark .fixed.inset-0 button[class*="border-gray-200"],
        .dark .fixed.inset-0 button[class*="border-slate-200"] {
          background-color: #0f172a !important;
          border-color: #475569 !important;
          color: #e2e8f0 !important;
        }

        .dark .fixed.inset-0 button[class*="bg-white"]:hover,
        .dark .fixed.inset-0 button[class*="border-gray-200"]:hover,
        .dark .fixed.inset-0 button[class*="border-slate-200"]:hover {
          background-color: #1e293b !important;
          color: #f8fafc !important;
        }

        .dark .fixed.inset-0 button[class*="bg-red"],
        .dark .fixed.inset-0 button[class*="bg-rose"],
        .dark .fixed.inset-0 button[class*="text-red"],
        .dark .fixed.inset-0 button[class*="text-rose"] {
          background-color: rgba(244, 63, 94, 0.16) !important;
          border-color: rgba(244, 63, 94, 0.38) !important;
          color: #fda4af !important;
        }
      `}</style>
    </div>
  );
}
