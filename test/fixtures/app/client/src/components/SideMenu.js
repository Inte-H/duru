import { Link } from 'react-router-dom';
import Option from '_define/Option';

export default function SideMenu({ session, globalSettings }) {
  const MENUS = globalSettings.SYSTEM.MAIN_MENU;
  const items = [];

  if (MENUS.ADMIN) {
    if (['ADMIN', 'OWNER'].indexOf(session['member.role']) > -1) {
      MENUS.ADMIN?.LIST?.forEach((menu) => {
        items.push({ title: menu, href: Option.ROUTE_PATH[menu] });
      });
    }
  }

  return (
    <nav>
      {items.map((item) => (
        <Link key={item.href} to={item.href}>
          {item.title}
        </Link>
      ))}
    </nav>
  );
}
