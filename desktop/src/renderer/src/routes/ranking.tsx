import { Navigate } from 'react-router-dom';

export function RankingRoute() {
  return <Navigate replace to="/inventory/stock?compose=1&section=merchandising" />;
}
