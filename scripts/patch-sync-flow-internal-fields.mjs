/**
 * Map Create/Update SharePoint item keys to SH-PS PeerSupportEvents internal field names.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FLOW_IDS = [
  '806c095a-c2e5-40c4-b912-2604cf6aea02',
  '0e82ff1f-9ed5-4af6-8156-980655e8dcee',
  'd25d8d5d-76e4-491a-b89b-1d7f83e9959f',
];

/** Logical keys used in expressions → SharePoint internal names on SH-PS list */
const FIELD_MAP = {
  PeerPointEventId: 'PeerPoint_x0020_Event_x0020_Id0',
  EventDate: 'Event_x0020_Date0',
  EventDateValue: 'Event_x0020_Date_x0020__x0028_so0',
  RecordedAt: 'Recorded_x0020_At0',
  PrpsBureau: 'PRPS_x0020_Bureau0',
  PrpsGender: 'PRPS_x0020_Gender0',
  WorkRelatedIncident: 'Work_x0020_Related_x0020_Inciden0',
  HelpType: 'Resources_x0020__x002f__x0020_Re0',
  ProviderDisplayName: 'Peer_x0020_Supporter0',
  ProviderUsername: 'Provider_x0020_Username0',
  TotalMinutes: 'Total_x0020_Minutes0',
  CreatedByDisplay: 'Logged_x0020_By0',
};

const CHOICE_FIELDS = new Set(['PrpsBureau', 'PrpsGender', 'WorkRelatedIncident']);

function buildItemPayload(includePeerPointId) {
  const item = {
    Title: "@{concat(items('For_each_event')?['providerDisplayName'], ' — ', items('For_each_event')?['eventDate'])}",
  };
  if (includePeerPointId) {
    item[FIELD_MAP.PeerPointEventId] = "@{items('For_each_event')?['id']}";
  }
  item[FIELD_MAP.EventDate] = "@{items('For_each_event')?['eventDate']}";
  item[FIELD_MAP.EventDateValue] = "@{items('For_each_event')?['eventDate']}";
  item[FIELD_MAP.RecordedAt] = "@{items('For_each_event')?['recordedAt']}";
  item[FIELD_MAP.PrpsBureau] = { Value: "@{items('For_each_event')?['prpsBureau']}" };
  item[FIELD_MAP.PrpsGender] = { Value: "@{items('For_each_event')?['prpsGender']}" };
  item[FIELD_MAP.WorkRelatedIncident] = {
    Value: "@{coalesce(items('For_each_event')?['workRelatedIncident'], 'no')}",
  };
  item[FIELD_MAP.HelpType] = "@{items('For_each_event')?['helpType']}";
  item[FIELD_MAP.ProviderDisplayName] = "@{items('For_each_event')?['providerDisplayName']}";
  item[FIELD_MAP.ProviderUsername] = "@{coalesce(items('For_each_event')?['providerUsername'], '')}";
  item[FIELD_MAP.TotalMinutes] = "@items('For_each_event')?['totalMinutes']";
  item[FIELD_MAP.CreatedByDisplay] = "@{coalesce(items('For_each_event')?['createdByDisplay'], '')}";
  return item;
}

function patchDefinition(def) {
  const fe = def?.actions?.For_each_event?.actions;
  if (!fe) throw new Error('For_each_event not found');

  const create = fe.Create_or_update?.actions?.Create_item;
  if (create?.inputs?.parameters) {
    const { dataset, table } = create.inputs.parameters;
    create.inputs.parameters = {
      dataset,
      table,
      item: buildItemPayload(true),
    };
  }

  const update = fe.Create_or_update?.else?.actions?.Update_item;
  if (update?.inputs?.parameters) {
    const { dataset, table, id } = update.inputs.parameters;
    update.inputs.parameters = {
      dataset,
      table,
      id,
      item: buildItemPayload(false),
    };
  }

  return def;
}

for (const flowId of FLOW_IDS) {
  const merged = path.join(__dirname, '_temp-flow-defs', `merged-${flowId}.json`);
  let def;
  if (fs.existsSync(merged)) {
    const j = JSON.parse(fs.readFileSync(merged, 'utf8'));
    def = j.definition ?? j;
  } else {
    const from806 = path.join(__dirname, '_temp-flow-defs', `${flowId}.json`);
    if (!fs.existsSync(from806)) {
      console.error('Missing', flowId);
      process.exitCode = 1;
      continue;
    }
    const j = JSON.parse(fs.readFileSync(from806, 'utf8'));
    def = j.properties?.definition ?? j.definition ?? j;
  }
  patchDefinition(def);
  const outPath = path.join(__dirname, '_temp-flow-defs', `patched-internal-${flowId}.json`);
  fs.writeFileSync(outPath, JSON.stringify(def));
  console.log('Wrote', outPath);
}

// Also refresh repo template item block for future deploys
const templatePath = path.join(__dirname, 'flow-peerpoint-sync-events.definition.json');
if (fs.existsSync(templatePath)) {
  const tpl = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
  patchDefinition(tpl);
  // Template uses flat item/ — convert template to nested internal names manually via same patch
  fs.writeFileSync(templatePath, JSON.stringify(tpl, null, 2) + '\n');
  console.log('Updated', templatePath);
}
