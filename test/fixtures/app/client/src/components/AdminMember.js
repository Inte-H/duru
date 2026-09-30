import { useEffect } from 'react';
import { ajaxMemberList } from '_ajax/AjaxFunc';

export default function AdminMember() {
  useEffect(() => {
    ajaxMemberList();
  }, []);

  return <section>Members</section>;
}
