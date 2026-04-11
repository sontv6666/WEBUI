import type { ReactNode } from "react";

export function computePageCount(total: number, pageSize: number) {
  if (total <= 0) return 1;
  return Math.max(1, Math.ceil(total / pageSize));
}

export function slicePage<T>(items: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

type PaginationBarProps = {
  page: number;
  pageCount: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  /** Ví dụ: "Phân trang timeline" */
  ariaLabel: string;
  /** Nội dung bổ sung bên trái (vd. chọn kích thước trang) */
  startSlot?: ReactNode;
};

export function PaginationBar({
  page,
  pageCount,
  totalItems,
  pageSize,
  onPageChange,
  ariaLabel,
  startSlot,
}: PaginationBarProps) {
  if (totalItems === 0) return null;

  const from = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalItems);

  return (
    <div className="pagination-wrap">
      {startSlot ? <div className="pagination-slot-start">{startSlot}</div> : null}
      <p className="pagination-range" aria-live="polite">
        <span className="pagination-range__nums">
          {from}–{to}
        </span>
        <span className="pagination-range__of"> trong </span>
        <span className="pagination-range__total">{totalItems}</span>
      </p>
      {pageCount <= 1 ? (
        <span className="pagination-single" aria-hidden>
          Một trang
        </span>
      ) : (
        <nav className="pagination-bar" aria-label={ariaLabel}>
          <button
            type="button"
            className="pagination-btn"
            disabled={page <= 1}
            onClick={() => onPageChange(1)}
            aria-label="Trang đầu"
          >
            «
          </button>
          <button
            type="button"
            className="pagination-btn"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            aria-label="Trang trước"
          >
            ‹
          </button>
          <span className="pagination-current">
            Trang <strong>{page}</strong> / {pageCount}
          </span>
          <button
            type="button"
            className="pagination-btn"
            disabled={page >= pageCount}
            onClick={() => onPageChange(page + 1)}
            aria-label="Trang sau"
          >
            ›
          </button>
          <button
            type="button"
            className="pagination-btn"
            disabled={page >= pageCount}
            onClick={() => onPageChange(pageCount)}
            aria-label="Trang cuối"
          >
            »
          </button>
        </nav>
      )}
    </div>
  );
}
