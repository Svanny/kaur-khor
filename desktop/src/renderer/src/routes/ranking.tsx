import { Navigate } from 'react-router-dom';

export function RankingRoute() {
  return <Navigate replace to="/inventory/stock/session?step=ranking" />;
}
