import './styles.css';

type ColumnType = 'text' | 'number' | 'checkbox' | 'select' | 'textarea';

export type ColumnOption = { label: string; value: string };

export type ColumnDef<T> = {
  key: keyof T;
  label: string;
  type?: ColumnType;
  options?: ColumnOption[]; // for select
  widthPx?: number;
  placeholder?: string;
};

interface EditableTableProps<T extends { id?: string }> {
  title: string;
  rows: T[];
  columns: ColumnDef<T>[];
  onChange: (rows: T[]) => void;
  createRow: () => T;

  // usability toggles
  allowDelete?: boolean;
  allowDuplicate?: boolean;
  allowReorder?: boolean;
  confirmDelete?: boolean;
}

export function EditableTable<T extends { id?: string }>({
  title,
  rows,
  columns,
  onChange,
  createRow,
  allowDelete = true,
  allowDuplicate = true,
  allowReorder = true,
  confirmDelete = true,
}: EditableTableProps<T>) {
  const updateCell = (rowIndex: number, key: keyof T, value: unknown) => {
    const next = [...rows];
    next[rowIndex] = { ...(next[rowIndex] as any), [key]: value } as T;
    onChange(next);
  };

  const addRow = () => onChange([...rows, createRow()]);

  const deleteRow = (i: number) => {
    if (confirmDelete) {
      const ok = window.confirm('Delete this row?');
      if (!ok) return;
    }
    const next = rows.filter((_, idx) => idx !== i);
    onChange(next);
  };

  const duplicateRow = (i: number) => {
    const row = rows[i];
    const copy = { ...(structuredClone(row) as any) } as T;
    // ensure id is unique if present
    if ((copy as any).id) (copy as any).id = crypto.randomUUID();
    const next = [...rows.slice(0, i + 1), copy, ...rows.slice(i + 1)];
    onChange(next);
  };

  const moveRow = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    const tmp = next[i];
    next[i] = next[j];
    next[j] = tmp;
    onChange(next);
  };

  const anyActions = allowDelete || allowDuplicate || allowReorder;

  return (
    <div className="card">
      <div className="section-header">
        <h3>{title}</h3>
        <button onClick={addRow}>Add row</button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={String(c.key)} style={c.widthPx ? { width: c.widthPx } : undefined}>
                  {c.label}
                </th>
              ))}
              {anyActions && <th style={{ width: 160 }}>Actions</th>}
            </tr>
          </thead>

          <tbody>
            {rows.map((r, i) => (
              <tr key={String(r.id ?? i)}>
                {columns.map((c) => {
                  const value = (r as any)[c.key];

                  // checkbox
                  if (c.type === 'checkbox') {
                    return (
                      <td key={String(c.key)}>
                        <input
                          type="checkbox"
                          checked={Boolean(value)}
                          onChange={(e) => updateCell(i, c.key, e.target.checked)}
                        />
                      </td>
                    );
                  }

                  // select
                  if (c.type === 'select') {
                    const v = value == null ? '' : String(value);
                    return (
                      <td key={String(c.key)}>
                        <select value={v} onChange={(e) => updateCell(i, c.key, e.target.value)}>
                          {(c.options ?? []).map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </td>
                    );
                  }

                  // textarea
                  if (c.type === 'textarea') {
                    return (
                      <td key={String(c.key)}>
                        <textarea
                          rows={2}
                          value={value == null ? '' : String(value)}
                          placeholder={c.placeholder}
                          onChange={(e) => updateCell(i, c.key, e.target.value)}
                        />
                      </td>
                    );
                  }

                  // number/text fallback
                  const isNumber = c.type === 'number';
                  return (
                    <td key={String(c.key)}>
                      <input
                        type={isNumber ? 'number' : 'text'}
                        value={value == null ? '' : String(value)}
                        placeholder={c.placeholder}
                        onChange={(e) =>
                          updateCell(i, c.key, isNumber ? Number(e.target.value) : e.target.value)
                        }
                      />
                    </td>
                  );
                })}

                {anyActions && (
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {allowReorder && (
                        <>
                          <button onClick={() => moveRow(i, -1)} disabled={i === 0}>
                            ↑
                          </button>
                          <button onClick={() => moveRow(i, 1)} disabled={i === rows.length - 1}>
                            ↓
                          </button>
                        </>
                      )}
                      {allowDuplicate && <button onClick={() => duplicateRow(i)}>Duplicate</button>}
                      {allowDelete && (
                        <button onClick={() => deleteRow(i)} style={{ opacity: 0.9 }}>
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}

            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + (anyActions ? 1 : 0)} className="small">
                  No rows yet. Click <b>Add row</b>.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
