import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import Option from '_define/Option';
import { ajaxLabExperiment } from '_ajax/AjaxFunc';

export default function Lab() {
  useEffect(() => {
    ajaxLabExperiment();
  }, []);

  return (
    <section>
      Lab
      <Link to={Option.ROUTE_PATH.LAB_RESULT}>Results</Link>
    </section>
  );
}
