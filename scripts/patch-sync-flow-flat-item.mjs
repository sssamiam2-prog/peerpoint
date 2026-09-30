/**
 * Flatten SharePoint PostItem/PatchItem parameters from nested `item` to `item/Field` keys.
 * Reads flow definition JSON from scripts/_temp-flow-defs/def-only-*.json or merged files.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const FLOW_IDS = [
  '806c095a-c2e5-40c4-b912-2604cf6aea02',
  '0e82ff1f-9ed5-4af6-8156-980655e8dcee',
  'd25d8d5d-76e4-491a-b89b-1d7f83e9959f',
];

function flattenItemParams(params) {
  if (!params || typeof params !== 'object' || !params.item) return params;
  const { dataset, table, id, item, ...rest } = params;
  const out = { ...rest };
  if (dataset !== undefined) out.dataset = dataset;
  if (table !== undefined) out.table = table;
  if (id !== undefined) out.id = id;
  for (const [k, v] of Object.entries(item)) {
    out[`item/${k}`] = v;
  }
  return out;
}

function patchDefinition(def) {
  const fe = def?.actions?.For_each_event?.actions;
  if (!fe) throw new Error('For_each_event not found');

  const create = fe.Create_or_update?.actions?.Create_item;
  if (create?.inputs?.parameters) {
    create.inputs.parameters = flattenItemParams(create.inputs.parameters);
  }

  const update = fe.Create_or_update?.else?.actions?.Update_item;
  if (update?.inputs?.parameters) {
    const p = update.inputs.parameters;
    update.inputs.parameters = flattenItemParams(p);
    // Ensure choice fields use { Value } on patch (match create)
    for (const key of ['item/PrpsBureau', 'item/PrpsGender', 'item/WorkRelatedIncident']) {
      const v = update.inputs.parameters[key];
      if (v != null && typeof v === 'string' && !v.startsWith('@')) {
        update.inputs.parameters[key] = { Value: v };
      }
    }
    if (update.inputs.parameters['item/WorkRelatedIncident']?.Value === "@{coalesce(items('For_each_event')?['workRelatedIncident'], '')}") {
      update.inputs.parameters['item/WorkRelatedIncident'] = {
        Value: "@{coalesce(items('For_each_event')?['workRelatedIncident'], 'no')}",
      };
    }
    for (const key of ['item/PrpsBureau', 'item/PrpsGender']) {
      const v = update.inputs.parameters[key];
      if (typeof v === 'string' && v.startsWith('@{')) {
        update.inputs.parameters[key] = { Value: v };
      }
    }
  }

  return def;
}

for (const flowId of FLOW_IDS) {
  const merged = path.join(__dirname, '_temp-flow-defs', `merged-${flowId}.json`);
  const defOnly = path.join(__dirname, '_temp-flow-defs', `def-only-${flowId}.json`);
  let def;
  if (fs.existsSync(merged)) {
    const j = JSON.parse(fs.readFileSync(merged, 'utf8'));
    def = j.definition ?? j;
  } else if (fs.existsSync(defOnly)) {
    def = JSON.parse(fs.readFileSync(defOnly, 'utf8'));
  } else {
    console.error('Missing def for', flowId);
    process.exitCode = 1;
    continue;
  }
  patchDefinition(def);
  const outPath = path.join(__dirname, '_temp-flow-defs', `patched-def-${flowId}.json`);
  fs.writeFileSync(outPath, JSON.stringify(def));
  console.log('Wrote', outPath, 'bytes', fs.statSync(outPath).size);
}
