import { useState } from 'react';
import { ajaxReportArchive, ajaxReportExport } from '_ajax/AjaxFunc';

const PACKAGE_BODY = { format: 'zip', withAttachments: true };

export default function ExportDialog({ ids }) {
  const [withHistory, setWithHistory] = useState(false);
  const signedOnly = true;

  return (
    <dialog open>
      <label>
        <input type="checkbox" checked={withHistory} onChange={(e) => setWithHistory(e.target.checked)} />
        Include history
      </label>
      <button onClick={() => ajaxReportExport({ ids, withHistory, format: 'pdf' })}>Export</button>
      <button onClick={() => ajaxReportExport(PACKAGE_BODY)}>Export package</button>
      <button onClick={() => ajaxReportArchive({ data: { ids, signedOnly, withHistory } })}>Archive</button>
    </dialog>
  );
}
