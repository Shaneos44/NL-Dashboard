import './styles.css';

type ColumnType = 'text' | 'number' | 'checkbox';

type ColumnDef<T> = {
  key: keyof T;
  label: string;
  type?: ColumnType;
};

interface EditableTableProps<T extends { id?: string }> {
  title: string;
  rows: T[];
  columns: ColumnDef<T>[];
  onChange: (rows: T[]) => void;
  createRow: () => T;
}

export function EditableTable<T extends { id?: string }>({
  title,
  rows,
  columns,
  onChange,
  createRow,
}: EditableTableProps<T>) {
  const updateCell = (rowIndex: number, key: keyof T, value: unknown) => {
    const next = [...rows];
    next[rowIndex] = { ...(next[rowIndex] as any), [key]: value } as T;
    onChange(next);
  };

  return (
    <div className="card">
      <div className="section-header">
        <h3>{title}</h3>
        <button onClick={() => onChange([...rows, createRow()])}>Add row</button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={String(c.key)}>{c.label}</th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map((r, i) => (
              <tr key={String(r.id ?? i)}>
                {columns.map((c) => {
                  const value = (r as any)[c.key];

                  if (c.type === 'checkbox') {
                    return (
                      <td key={String(c.key)}>
                        <input
                          type="checkbox"
                          checked={Boolean(value)}
                          onChange={(e) =>
                            updateCell(i, c.key, e.target.checked)
                          }
                        />
                      </td>
                    );
                  }

                  const isNumber = c.type === 'number';

                  return (
                    <td key={String(c.key)}>
                      <input
                        type={isNumber ? 'number' : 'text'}
                        value={value == null ? '' : String(value)}
                        onChange={(e) =>
                          updateCell(
                            i,
                            c.key,
                            isNumber ? Number(e.target.value) : e.target.value
                          )
                        }
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
