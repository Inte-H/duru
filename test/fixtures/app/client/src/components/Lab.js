import { useEffect } from 'react';
import { ajaxLabExperiment } from '_ajax/AjaxFunc';

export default function Lab() {
  useEffect(() => {
    ajaxLabExperiment();
  }, []);

  return <section>Lab</section>;
}
