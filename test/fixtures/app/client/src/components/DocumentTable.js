import { Link } from 'react-router-dom';
import Option from '_define/Option';
import { ajaxDocumentArchive } from '_ajax/AjaxFunc';

export default function DocumentTable({ rows = [], selected = [], globalSettings }) {
  const pageSize = globalSettings.DISPLAY.PAGE_SIZE;

  return (
    <table data-page-size={pageSize}>
      {rows.map((row) => (
        <tr key={row.id}>
          <td>
            <Link to={`${Option.ROUTE_PATH.DOCUMENT}/${row.id}`}>{row.name}</Link>
          </td>
        </tr>
      ))}
      {selected.length > 0 && <button onClick={() => ajaxDocumentArchive(selected)}>Archive</button>}
    </table>
  );
}
