import type { ScenarioData } from './types';
import { stockRemainingAfterProduction } from './calc';

import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

import {
  Document,
  Packer,
  Paragraph,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  TextRun,
} from 'docx';

const ymd = () => new Date().toISOString().slice(0, 10);

function safe(v: any) {
  if (v === null || v === undefined) return '';
  return String(v);
}

function makeSheet(rows: Record<string, any>[], sheetName: string) {
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.sheet_add_aoa(ws, [[sheetName]], { origin: 'A1' });
  return ws;
}

function toRowsStock(s: ScenarioData) {
  const view = stockRemainingAfterProduction(s);
  return view.map((r) => ({
    Item: r.name,
    'On hand': r.onHandQty,
    Consumed: Math.round(r.consumedQty),
    Remaining: Math.round(r.remainingQty),
    'Reorder point': r.reorderPointQty ?? '',
    Min: r.minQty ?? '',
    Status: r.status,
  }));
}

function toRowsDecisions(s: ScenarioData) {
  return s.decisions.map((d) => ({
    Decision: d.title,
    Target: d.target,
    Owner: d.owner,
    Status: d.status,
    Notes: d.notes,
  }));
}

function toRowsCapas(s: ScenarioData) {
  return s.capas.map((c) => ({
    Ref: c.ref,
    'Batch ID': c.batchId ?? '',
    Title: c.title,
    Owner: c.owner,
    'Due date': c.dueDate,
    Status: c.status,
    'Root cause': c.rootCause,
    Action: c.action,
    Notes: c.notes,
  }));
}

function toRowsIssues(s: ScenarioData) {
  const procName = (pid: string) => s.processes.find((p) => p.id === pid)?.name ?? pid;
  const batchName = (bid: string) => s.batches.find((b) => b.id === bid)?.batchNumber ?? bid;

  return s.schedule
    .filter((e) => e.status === 'Issue' || e.status === 'Quarantine' || e.status === 'Cancelled')
    .map((e) => ({
      Date: e.date,
      Batch: batchName(e.batchId),
      Process: procName(e.processId),
      Status: e.status,
      Notes: e.notes,
      Observations: e.observations,
      People: e.assignedPeopleIdsCsv,
      Machines: e.assignedMachineIdsCsv,
    }));
}

function toRowsRisks(s: ScenarioData) {
  return s.risks.map((r) => ({
    Area: r.area,
    Status: r.status,
    Owner: r.owner,
    Mitigation: r.mitigation,
  }));
}

function toRowsMaintenance(s: ScenarioData) {
  const machineName = (id: string) => s.machines.find((m) => m.id === id)?.name ?? id;

  const blocks = s.maintenanceBlocks.map((m) => ({
    Date: m.date,
    'Duration (days)': m.durationDays,
    Machines: m.machineIdsCsv
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
      .map(machineName)
      .join(', '),
    Title: m.title,
    Status: m.status,
    Notes: m.notes,
  }));

  const machinesDown = s.machines
    .filter((m) => m.status === 'Out of Service')
    .map((m) => ({
      Machine: m.name,
      Type: m.type,
      Status: m.status,
      Notes: m.notes,
    }));

  return { blocks, machinesDown };
}

function toRowsSummary(s: ScenarioData) {
  const stock = stockRemainingAfterProduction(s);
  const belowMin = stock.filter((x) => x.status === 'Below Min').length;
  const reorder = stock.filter((x) => x.status === 'Reorder').length;

  const issues = s.schedule.filter((x) => x.status === 'Issue' || x.status === 'Quarantine').length;
  const openCapas = s.capas.filter((c) => c.status !== 'Closed' && c.status !== 'Cancelled').length;
  const machinesDown = s.machines.filter((m) => m.status === 'Out of Service').length;

  return [
    { Metric: 'Scenario', Value: s.name },
    { Metric: 'Export date', Value: ymd() },
    { Metric: 'Stock below min (count)', Value: belowMin },
    { Metric: 'Stock at reorder (count)', Value: reorder },
    { Metric: 'Open issues/quarantine (count)', Value: issues },
    { Metric: 'Open CAPAs (count)', Value: openCapas },
    { Metric: 'Machines out of service (count)', Value: machinesDown },
  ];
}

export function exportReportXlsx(s: ScenarioData) {
  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb, makeSheet(toRowsSummary(s), 'Summary'), 'Summary');
  XLSX.utils.book_append_sheet(wb, makeSheet(toRowsDecisions(s), 'Decisions'), 'Decisions');
  XLSX.utils.book_append_sheet(wb, makeSheet(toRowsCapas(s), 'CAPAs'), 'CAPAs');
  XLSX.utils.book_append_sheet(wb, makeSheet(toRowsIssues(s), 'Issues'), 'Issues');
  XLSX.utils.book_append_sheet(wb, makeSheet(toRowsStock(s), 'Stock'), 'Stock');
  XLSX.utils.book_append_sheet(wb, makeSheet(toRowsRisks(s), 'Risks'), 'Risks');

  const maint = toRowsMaintenance(s);
  XLSX.utils.book_append_sheet(wb, makeSheet(maint.blocks, 'Maintenance'), 'Maintenance');
  XLSX.utils.book_append_sheet(wb, makeSheet(maint.machinesDown, 'MachinesDown'), 'MachinesDown');

  const filename = `Ops_Report_${s.name}_${ymd()}.xlsx`;
  XLSX.writeFile(wb, filename);
}

function tableFromRows(rows: Record<string, any>[]) {
  if (rows.length === 0) {
    return new Paragraph({ children: [new TextRun('No entries.')] });
  }

  const headers = Object.keys(rows[0]);
  const headerRow = new TableRow({
    children: headers.map(
      (h) =>
        new TableCell({
          width: { size: 100 / headers.length, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })],
        })
    ),
  });

  const bodyRows = rows.map(
    (r) =>
      new TableRow({
        children: headers.map(
          (h) =>
            new TableCell({
              children: [new Paragraph(safe(r[h]))],
            })
        ),
      })
  );

  return new Table({
    rows: [headerRow, ...bodyRows],
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

export async function exportReportDocx(s: ScenarioData) {
  const maint = toRowsMaintenance(s);

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: `Ops Report — ${s.name}`, heading: HeadingLevel.TITLE }),
          new Paragraph({ text: `Export date: ${ymd()}` }),

          new Paragraph({ text: 'Executive Summary', heading: HeadingLevel.HEADING_1 }),
          tableFromRows(toRowsSummary(s) as any) as any,

          new Paragraph({ text: 'Decisions', heading: HeadingLevel.HEADING_1 }),
          tableFromRows(toRowsDecisions(s) as any) as any,

          new Paragraph({ text: 'CAPAs', heading: HeadingLevel.HEADING_1 }),
          tableFromRows(toRowsCapas(s) as any) as any,

          new Paragraph({ text: 'Issues / Quarantine / Cancelled Schedule Items', heading: HeadingLevel.HEADING_1 }),
          tableFromRows(toRowsIssues(s) as any) as any,

          new Paragraph({ text: 'Stock Condition', heading: HeadingLevel.HEADING_1 }),
          tableFromRows(toRowsStock(s) as any) as any,

          new Paragraph({ text: 'Risks', heading: HeadingLevel.HEADING_1 }),
          tableFromRows(toRowsRisks(s) as any) as any,

          new Paragraph({ text: 'Maintenance Blocks', heading: HeadingLevel.HEADING_1 }),
          tableFromRows(maint.blocks as any) as any,

          new Paragraph({ text: 'Machines Out of Service', heading: HeadingLevel.HEADING_1 }),
          tableFromRows(maint.machinesDown as any) as any,
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `Ops_Report_${s.name}_${ymd()}.docx`);
}
