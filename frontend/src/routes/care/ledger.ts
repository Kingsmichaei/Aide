import {
  CellStyleModule,
  ClientSideRowModelModule,
  colorSchemeDark,
  colorSchemeLight,
  CsvExportModule,
  DateFilterModule,
  NumberFilterModule,
  PaginationModule,
  QuickFilterModule,
  RenderApiModule,
  TextFilterModule,
  themeQuartz,
  type Module,
} from "ag-grid-community";

import type { LedgerRow } from "../../lib/api";

/** Enter on any cell opens that order, like a click on the row. */
export function openOnEnter(
  key: string | undefined,
  row: LedgerRow | undefined,
  onOpen: (row: LedgerRow) => void,
): void {
  if (key === "Enter" && row) onOpen(row);
}

/**
 * AG Grid Community modules only (free, MIT). Nothing here comes from
 * ag-grid-enterprise, so no licence key is needed.
 */
export const GRID_MODULES: Module[] = [
  ClientSideRowModelModule,
  TextFilterModule,
  NumberFilterModule,
  DateFilterModule,
  QuickFilterModule,
  PaginationModule,
  CsvExportModule,
  CellStyleModule, // right-aligned price column
  RenderApiModule, // setGridAriaProperty: names the grid for screen readers
];

/** The app's colours (Tailwind blue-800 accent, neutral greys) on AG Grid's Quartz theme. */
export function gridTheme(dark: boolean) {
  return themeQuartz
    .withPart(dark ? colorSchemeDark : colorSchemeLight)
    .withParams(
      dark
        ? {
            accentColor: "#93c5fd", // blue-300
            backgroundColor: "#171717", // neutral-900
            foregroundColor: "#f5f5f5", // neutral-100
            browserColorScheme: "dark",
          }
        : {
            accentColor: "#1e40af", // blue-800
            backgroundColor: "#ffffff",
            foregroundColor: "#171717", // neutral-900
            browserColorScheme: "light",
          },
    )
    .withParams({ fontFamily: "inherit", fontSize: 16, rowHeight: 44 });
}

export type StatusTone = "paid" | "waiting" | "stopped" | "refunded";

/** Status as a word first; the colour only repeats it. */
export function statusWord(row: LedgerRow, shopperName: string): string {
  switch (row.status) {
    case "captured":
      return "Paid";
    case "awaiting_caregiver":
      return "Waiting for you";
    case "awaiting_shopper":
      return `Waiting for ${shopperName}`;
    case "voided":
      return row.declined_by ? "Declined" : "Cancelled";
    case "refunded":
      return "Refunded";
    case "draft":
      return "Not confirmed";
  }
}

export function statusTone(row: LedgerRow): StatusTone {
  switch (row.status) {
    case "captured":
      return "paid";
    case "awaiting_caregiver":
    case "awaiting_shopper":
      return "waiting";
    case "refunded":
      return "refunded";
    default:
      return "stopped";
  }
}

export function methodWord(row: LedgerRow): string {
  if (row.method === "voice") return "Voice";
  if (row.method === "button") return "Button";
  return "—";
}

/** Who approved: a name, "Declined by …", or why no one needed to. */
export function approvedByWord(row: LedgerRow): string {
  if (row.approved_by) return row.approved_by;
  if (row.declined_by) return `Declined by ${row.declined_by}`;
  if (row.status === "captured") return "Not needed (within limit)";
  return "—";
}
