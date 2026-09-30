import { lazy } from 'react';
import { Route, Switch } from 'react-router-dom';
import Option from './_define/Option';
import Enum from './_define/Enum';
import SignIn from './components/SignIn';
import Home from './components/Home';

const waitFor = (Tag) =>
  function WaitFor(props) {
    return <Tag {...props} />;
  };

const isAdminRole = (role) => role === Enum.ROLE.ADMIN;

const DocumentList = lazy(() => import('./components/DocumentList'));
const DocumentDetail = lazy(() => import('./components/DocumentDetail'));
const Help = lazy(() => import('./components/Help'));
const AdminMember = lazy(() => import('./components/AdminMember'));
const Lab = lazy(() => import('./components/Lab'));

export default function Routes({ memberRole, globalSettings }) {
  return (
    <Switch>
      <Route path={Option.ROUTE_PATH.SIGN_IN} component={SignIn} exact />
      <Route path={Option.ROUTE_PATH.HOME} component={waitFor(Home)} exact />
      <Route path={`${Option.ROUTE_PATH.DOCUMENT}/:tab(draft|done)`} component={waitFor(DocumentList)} exact />
      <Route path={`${Option.ROUTE_PATH.DOCUMENT}/:id`} component={waitFor(DocumentDetail)} exact />
      <Route path={Option.ROUTE_PATH.HELP} component={Help} exact />
      {isAdminRole(memberRole) && <Route path={Option.ROUTE_PATH.ADMIN_MEMBER} component={AdminMember} exact />}
      {globalSettings.SYSTEM.LAB_ENABLED ? <Route path={Option.ROUTE_PATH.LAB} component={waitFor(Lab)} exact /> : null}
    </Switch>
  );
}
