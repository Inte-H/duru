import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import Option from '_define/Option';
import { ajaxDocumentList } from '_ajax/AjaxFunc';
import DocumentTable from './DocumentTable';

export default function Home({ memberRole, globalSettings, session }) {
  const isAdmin = memberRole === 'ADMIN';

  useEffect(() => {
    ajaxDocumentList();
  }, []);

  return (
    <div>
      <DocumentTable />
      {memberRole === 'ADMIN' && <Link to={Option.ROUTE_PATH.ADMIN_MEMBER}>Members</Link>}
      {isAdmin && <Link to={Option.ROUTE_PATH.ADMIN_GROUP}>Groups</Link>}
      {globalSettings.SYSTEM.LAB_ENABLED && <Link to={Option.ROUTE_PATH.LAB}>Lab</Link>}
      {session['member.role'] === 'AUDITOR' && <Link to={Option.ROUTE_PATH.ADMIN_AUDIT}>Audit</Link>}
    </div>
  );
}
