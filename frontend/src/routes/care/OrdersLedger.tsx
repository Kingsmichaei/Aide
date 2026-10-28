import type {
  CellKeyDownEvent,
  ColDef,
  GridReadyEvent,
  ICellRendererParams,
  ValueFormatterParams,
} from "ag-grid-community";
import { AgGridProvider, AgGridReact } from "ag-grid-react";
import { useId, useMemo, useRef, useState } from "react";

import type { LedgerRow } from "../../lib/api";
import { formatMoney } from "../../lib/format";
import { usePrefersDark } from "../../lib/usePrefersDark";
import {
  approvedByWord,
  GRID_MODULES,
  gridTheme,
  methodWord,
  openOnEnter,
  statusTone,
  statusWord,
  type StatusTone,
} from "./ledger";

const TONE_DOT: Record<StatusTone, string> = {
  paid: "bg-green-700",
  waiting: "bg-amber-600",
  stopped: "bg-neutral-500",
  refunded: "bg-purple-700",
};

interface Props {
  shopperName: string;
  rows: LedgerRow[] | null;
  onOpen: (row: LedgerRow) => void;
}

/** Every order, sortable, filterable and searchable, with CSV export. */
export function OrdersLedger({ shopperName, rows, onOpen }: Props) {
  const searchId = useId();
  const grid = useRef<AgGridReact<LedgerRow>>(null);
  const [search, setSearch] = useState("");
  const dark = usePrefersDark();
  const theme = useMemo(() => gridTheme(dark), [dark]);

  const columns = useMemo<ColDef<LedgerRow>[]>(
    () => [
      {
        headerName: "Date",
        field: "created_at",
        filter: "agDateColumnFilter",
        sort: "desc",
        valueGetter: (p) => (p.data ? new Date(p.data.created_at) : null),
        valueFormatter: (p: ValueFormatterParams<LedgerRow, Date | null>) =>
          p.value
            ? p.value.toLocaleDateString("en-US", { dateStyle: "medium" })
            : "",
        // Quick search and CSV use the same readable date.
        getQuickFilterText: (p) =>
          p.data
            ? new Date(p.data.created_at).toLocaleDateString("en-US", {
                dateStyle: "medium",
              })
            : "",
        minWidth: 130,
      },
      {
        headerName: "Item",
        field: "title",
        filter: "agTextColumnFilter",
        flex: 2,
        minWidth: 200,
      },
      {
        headerName: "Retailer",
        field: "retailer",
        filter: "agTextColumnFilter",
        minWidth: 140,
      },
      {
        headerName: "Category",
        field: "category",
        filter: "agTextColumnFilter",
        valueFormatter: (p) => p.value ?? "—",
        minWidth: 130,
      },
      {
        headerName: "Price",
        colId: "total",
        filter: "agNumberColumnFilter",
        type: "rightAligned",
        valueGetter: (p) => (p.data ? Number(p.data.total) : null),
        valueFormatter: (p: ValueFormatterParams<LedgerRow, number | null>) =>
          p.data && p.value !== null && p.value !== undefined
            ? formatMoney(String(p.value), p.data.currency, "en-US")
            : "",
        minWidth: 110,
      },
      {
        headerName: "Status",
        colId: "status",
        filter: "agTextColumnFilter",
        // The word is the value, so sorting, filters, search and CSV all use it.
        valueGetter: (p) => (p.data ? statusWord(p.data, shopperName) : ""),
        cellRenderer: (p: ICellRendererParams<LedgerRow, string>) =>
          p.data ? (
            <span className="inline-flex items-center gap-2">
              <span
                aria-hidden="true"
                className={`inline-block size-3 rounded-full ${TONE_DOT[statusTone(p.data)]}`}
              />
              {p.value}
            </span>
          ) : null,
        minWidth: 160,
      },
      {
        headerName: "Method",
        colId: "method",
        filter: "agTextColumnFilter",
        valueGetter: (p) => (p.data ? methodWord(p.data) : ""),
        minWidth: 110,
      },
      {
        headerName: "Approved by",
        colId: "approved_by",
        filter: "agTextColumnFilter",
        valueGetter: (p) => (p.data ? approvedByWord(p.data) : ""),
        minWidth: 170,
      },
    ],
    [shopperName],
  );

  function onGridReady(event: GridReadyEvent<LedgerRow>) {
    // The grid has no visible title of its own; name it for screen readers.
    event.api.setGridAriaProperty("label", `Orders for ${shopperName}`);
  }

  function onCellKeyDown(event: CellKeyDownEvent<LedgerRow>) {
    openOnEnter((event.event as KeyboardEvent | null)?.key, event.data, onOpen);
  }

  return (
    <section aria-labelledby="ledger-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="ledger-heading" className="text-2xl font-semibold">
          Orders
        </h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor={searchId} className="text-sm font-semibold">
              Search orders
            </label>
            <input
              id={searchId}
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Item, store, status…"
              className="min-h-11 rounded-lg border-2 border-neutral-500 px-3 dark:bg-neutral-900"
            />
          </div>
          <button
            type="button"
            onClick={() =>
              grid.current?.api.exportDataAsCsv({
                fileName: `aide-orders-${shopperName.toLowerCase()}.csv`,
              })
            }
            disabled={!rows?.length}
            className="min-h-11 rounded-lg border-2 border-blue-800 px-4 font-semibold disabled:opacity-60 dark:border-blue-300"
          >
            Download CSV
          </button>
        </div>
      </div>
      <p className="text-sm">
        Select a row, or move to it and press Enter, to see the order and the
        conversation behind it.
      </p>
      <AgGridProvider modules={GRID_MODULES}>
        <AgGridReact<LedgerRow>
          ref={grid}
          theme={theme}
          rowData={rows}
          columnDefs={columns}
          defaultColDef={{ sortable: true, resizable: true, flex: 1 }}
          getRowId={(p) => String(p.data.id)}
          quickFilterText={search}
          onRowClicked={(event) => event.data && onOpen(event.data)}
          onCellKeyDown={onCellKeyDown}
          onGridReady={onGridReady}
          // AG Grid's accessibility guidance: keep every row of the page in
          // the DOM, in order, and don't animate rows.
          pagination
          paginationPageSize={10}
          paginationPageSizeSelector={[10, 25, 50]}
          domLayout="autoHeight"
          ensureDomOrder
          suppressColumnVirtualisation
          animateRows={false}
          overlayNoRowsTemplate="No orders yet."
        />
      </AgGridProvider>
    </section>
  );
}
