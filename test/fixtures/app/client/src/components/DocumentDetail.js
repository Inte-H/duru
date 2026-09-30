import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import Option from '_define/Option';
import { ajaxDocumentDetail, ajaxDocumentRename } from '_ajax/AjaxFunc';

export default function DocumentDetail({ match, canEdit, globalSettings }) {
  const { id } = match.params;
  const system = globalSettings.SYSTEM;
  const helpEnabled = system.HELP_LINK_ENABLED;

  useEffect(() => {
    ajaxDocumentDetail(id);
  }, [id]);

  const rename = (name) => ajaxDocumentRename(id, name);

  return (
    <div>
      {canEdit ? <input onBlur={(e) => rename(e.target.value)} /> : null}
      {helpEnabled && <Link to={Option.ROUTE_PATH.HELP}>Help</Link>}
    </div>
  );
}
