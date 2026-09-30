import { useEffect } from 'react';
import { ajaxDocumentDetail, ajaxDocumentRename } from '_ajax/AjaxFunc';

export default function DocumentDetail({ match, canEdit }) {
  const { id } = match.params;

  useEffect(() => {
    ajaxDocumentDetail(id);
  }, [id]);

  const rename = (name) => ajaxDocumentRename(id, name);

  return <div>{canEdit ? <input onBlur={(e) => rename(e.target.value)} /> : null}</div>;
}
