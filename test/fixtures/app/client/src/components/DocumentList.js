import { ajaxDownload } from '_ajax/AjaxFunc';
import DocumentTable from './DocumentTable';

export default function DocumentList({ exportUrl }) {
  return (
    <div>
      <DocumentTable />
      <button onClick={() => ajaxDownload(exportUrl)}>Export</button>
    </div>
  );
}
