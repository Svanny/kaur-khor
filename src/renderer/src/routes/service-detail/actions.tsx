import { Link } from 'react-router-dom';
import { ArrowUpRight, ClipboardPlus, PackageCheck, SquarePen, Tags } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ServiceDetailViewModel } from './view-model';

export function ServiceDetailActions({
  actions,
}: {
  actions: ServiceDetailViewModel['actions'];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild size="sm" type="button">
        <Link to={actions.primarySkuHref}>
          <ArrowUpRight className="size-4" />
          Open bottleneck SKU
        </Link>
      </Button>
      <Button asChild size="sm" type="button" variant="outline">
        <Link to={actions.logReceiptHref}>
          <ClipboardPlus className="size-4" />
          Log receipt
        </Link>
      </Button>
      <Button asChild size="sm" type="button" variant="outline">
        <Link to={actions.recordStockHref}>
          <PackageCheck className="size-4" />
          Record stock
        </Link>
      </Button>
      <Button asChild size="sm" type="button" variant="outline">
        <Link to={actions.updatePriceHref}>
          <Tags className="size-4" />
          Update price
        </Link>
      </Button>
      <Button asChild size="sm" type="button" variant="outline">
        <Link to={actions.editServiceHref}>
          <SquarePen className="size-4" />
          Edit service
        </Link>
      </Button>
    </div>
  );
}
