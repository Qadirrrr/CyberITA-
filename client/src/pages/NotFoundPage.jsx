import { Link } from 'react-router-dom';
import { Button } from '../components/ui';
import { IconArrowLeft, IconSearch, IconTerminal } from '../components/icons';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="text-center">
        <p className="font-display text-7xl font-semibold text-slate-200 dark:text-white/10">404</p>
        <div className="mx-auto -mt-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-brand-50 text-brand-600 shadow-sm dark:border-white/10 dark:bg-night-850 dark:text-brand-300">
          <IconSearch size={24} />
        </div>
        <h1 className="mt-5 font-display text-2xl font-semibold">We couldn't find that page</h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">
          The link may be broken or the page may have moved. Try the course catalog, or head back to familiar ground.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button as={Link} to="/">
            <IconArrowLeft size={16} /> Back home
          </Button>
          <Button as={Link} to="/courses" variant="secondary">
            Browse courses
          </Button>
          <Button as={Link} to="/student/labs" variant="ghost">
            <IconTerminal size={16} /> Labs
          </Button>
        </div>
      </div>
    </div>
  );
}
