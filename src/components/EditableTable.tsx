import './styles.css';

interface EditableTableProps<T extends Record<string, unknown>> {
  title: string;
  rows: T[];
  columns: { key: keyof T; label: string; type?: 'text' | 'number' | 'checkbox' }[];
  onChange: (rows: T[]) => void;
  createRow: () => T;
}

export function EditableTable<T extends Record<string, unknown>>({ title, rows, columns, onChange, createRow }: EditableTableProps<T>) {
  const updateCell = (i: number, key: keyof T, value: unknown) => {
    const next = [...rows];
    next[i] = { ...next[i], [key]: value };
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
            <tr>{columns.map((c) => <th key={String(c.key)}>{c.label}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={String((r.id as string | undefined) ?? i)}>
                {columns.map((c) => {
                  const value = r[c.key];
                  if (c.type === 'checkbox') {
                    return (
                      <td key={String(c.key)}>
                        <input type="checkbox" checked={Boolean(value)} onChange={(e) => updateCell(i, c.key, e.target.checked)} />
                      </td>
                    );
                  }

                  return (
                    <td key={String(c.key)}>
                      <input
                        type={c.type === 'number' ? 'number' : 'text'}
                        value={String(value ?? '')}
                        onChange={(e) => updateCell(i, c.key, c.type === 'number' ? Number(e.target.value) : e.target.value)}
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
