-- Indexes that speed up the project-generation pipeline. Run these
-- ONCE in the Supabase SQL editor. Without them every IN(...) lookup
-- in the planning batch routes does a sequential scan, which on a
-- few-thousand-row catalog adds ~50–200ms per query.
--
-- All indexes are CREATE IF NOT EXISTS so re-running is a no-op.

-- main_task: looked up by name in IN(...) by getMaterialsBatch /
-- getEquipmentBatch / getDurationBatch and by the catalog cache.
CREATE INDEX IF NOT EXISTS idx_main_task_name_active
  ON main_task (name)
  WHERE is_active = true;

-- sub_task: paired lookups (main_task_id, description) from every
-- batch route. Composite index covers both column predicates.
CREATE INDEX IF NOT EXISTS idx_sub_task_main_desc_active
  ON sub_task (main_task_id, description)
  WHERE is_active = true;

-- task_duration_rules: paired lookup (main_task_id, sub_task_id) from
-- getDurationBatch.
CREATE INDEX IF NOT EXISTS idx_task_duration_rules_pair_active
  ON task_duration_rules (main_task_id, sub_task_id)
  WHERE is_active = true;

-- formula_templates: PK already covers this, but the active filter
-- benefits from a partial index when most rows are inactive.
CREATE INDEX IF NOT EXISTS idx_formula_templates_active
  ON formula_templates (formula_template_id)
  WHERE is_active = true;

-- formula_variables: looked up by formula_template_id with one row per
-- variable. Without this, every formula evaluation does a seq scan.
CREATE INDEX IF NOT EXISTS idx_formula_variables_template
  ON formula_variables (formula_template_id);

-- materials: looked up by material_id IN (...) when resolving
-- default_materials. PK covers id lookups but a list-style IN benefits
-- from a btree confirmation.
CREATE INDEX IF NOT EXISTS idx_materials_id
  ON materials (material_id);

-- equipment: looked up by both equipment_id (PK) and name (when
-- default_equipment carries free-form names instead of UUIDs).
CREATE INDEX IF NOT EXISTS idx_equipment_id
  ON equipment (equipment_id);

CREATE INDEX IF NOT EXISTS idx_equipment_name
  ON equipment (name);

-- After adding these, run ANALYZE so Postgres updates its planner stats:
-- ANALYZE main_task, sub_task, task_duration_rules,
--         formula_templates, formula_variables, materials, equipment;
