import {
  fetchWorkoutsInRange,
  localDayEndExclusiveIso,
  localDayStartIso,
  serializeWorkoutCsv,
  toExportRows,
  workoutCsvFileName,
  type WorkoutExportRow,
} from "@counter/shared";
import { useEffect, useRef, useState } from "react";
import { downloadTextFile } from "../lib/download";
import { unitLabel } from "../lib/format";
import { supabase } from "../lib/supabase";
import { useUnit } from "../lib/unit-context";

interface Props {
  userId: string;
  defaultFromDate: string; // "YYYY-MM-DD"
  onClose: () => void;
}

// Klientsidig CSV-export av den egna historiken. Läser bara - webben är
// read-only. Perioden förväljs till hela historiken.
export function WorkoutExportDialog({ userId, defaultFromDate, onClose }: Props) {
  const unit = useUnit();
  const [fromDate, setFromDate] = useState(defaultFromDate);
  const [toDate, setToDate] = useState(() => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  });
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");
  const [loadedWorkouts, setLoadedWorkouts] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [emptyNotice, setEmptyNotice] = useState(false);

  // Sätts innan onClose() vid varje stängväg, så en pågående hämtning
  // slutar mata onPage och aldrig laddar ner en fil efteråt.
  const cancelledRef = useRef(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      cancelledRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function close() {
    cancelledRef.current = true;
    onClose();
  }

  const rangeInvalid = fromDate === "" || toDate === "" || fromDate > toDate;

  async function runExport() {
    cancelledRef.current = false;
    setStatus("loading");
    setLoadedWorkouts(0);
    setError(null);
    setEmptyNotice(false);

    const range = {
      fromIso: localDayStartIso(fromDate),
      toExclusiveIso: localDayEndExclusiveIso(toDate),
    };
    const pages: WorkoutExportRow[][] = [];

    try {
      await fetchWorkoutsInRange(
        supabase,
        userId,
        range,
        (page, loadedTotal) => {
          // Sidorna kommer nyast först, passen inom en sida likaså.
          // Vänd sidan här och sidlistan efteråt -> filen kronologiskt
          // stigande. Vänd INTE den platta radlistan.
          pages.push([...page].reverse().flatMap(toExportRows));
          setLoadedWorkouts(loadedTotal);
        },
        { isCancelled: () => cancelledRef.current },
      );

      if (cancelledRef.current) return;

      const rows = pages.reverse().flat();
      if (rows.length === 0) {
        setEmptyNotice(true);
        setStatus("idle");
        return;
      }

      downloadTextFile(
        workoutCsvFileName(fromDate, toDate),
        serializeWorkoutCsv(rows, unit),
        "text/csv;charset=utf-8",
      );
      setStatus("done");
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Kunde inte hämta träningsdatan.",
      );
      setStatus("idle");
    }
  }

  return (
    <div
      className="dialog-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="dialog" role="dialog" aria-modal="true">
        <div className="dialog-header">
          <h2>Exportera träningsdata</h2>
          <button type="button" className="link-button" onClick={close}>
            Stäng
          </button>
        </div>

        <div className="dialog-body">
          <p className="text-muted">
            En rad per set. Vikter i {unitLabel(unit)}.
          </p>

          <div className="export-range">
            <label className="export-field">
              <span>Från</span>
              <input
                type="date"
                value={fromDate}
                max={toDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </label>
            <label className="export-field">
              <span>Till</span>
              <input
                type="date"
                value={toDate}
                min={fromDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </label>
          </div>

          {rangeInvalid && (
            <p className="status error">Välj ett giltigt datumintervall.</p>
          )}

          <div className="dialog-actions">
            <button
              type="button"
              className="button-secondary"
              onClick={close}
            >
              Avbryt
            </button>
            <button
              type="button"
              onClick={runExport}
              disabled={rangeInvalid || status === "loading"}
            >
              Ladda ner CSV
            </button>
          </div>

          {status === "loading" && (
            <p className="status">Hämtar pass… {loadedWorkouts} hittills</p>
          )}
          {emptyNotice && (
            <p className="status">Inga set att exportera i perioden.</p>
          )}
          {error && <p className="status error">{error}</p>}
        </div>
      </div>
    </div>
  );
}
