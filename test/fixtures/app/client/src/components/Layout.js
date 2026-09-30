import SideMenu from './SideMenu';

export default function Layout({ session, globalSettings, children }) {
  return (
    <div>
      <SideMenu session={session} globalSettings={globalSettings} />
      <main>{children}</main>
    </div>
  );
}
