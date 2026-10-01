import { useState } from 'react';
import { ajaxReportArchive, ajaxReportExport, ajaxReportSchedule } from '_ajax/AjaxFunc';
import { scheduleBody } from './scheduleBody';

const PACKAGE_BODY = { format: 'zip', withAttachments: true };

export default function ExportDialog({ ids }) {
  const [withHistory, setWithHistory] = useState(false);
  const signedOnly = true;
  const schedule = scheduleBody(ids);

  return (
    <dialog open>
      <label>
        <input type="checkbox" checked={withHistory} onChange={(e) => setWithHistory(e.target.checked)} />
        Include history
      </label>
      <button onClick={() => ajaxReportExport({ ids, withHistory, format: 'pdf' })}>Export</button>
      <button onClick={() => ajaxReportExport(PACKAGE_BODY)}>Export package</button>
      <button onClick={() => ajaxReportArchive({ data: { ids, signedOnly, withHistory } })}>Archive</button>
      <button onClick={() => ajaxReportSchedule(schedule)}>Export every week</button>
    </dialog>
  );
}
