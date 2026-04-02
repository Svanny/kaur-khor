import { Link } from 'react-router-dom';
import { WorkspaceActionRow, WorkspaceEmpty, WorkspaceHero, WorkspacePage, WorkspacePanel } from '@/components/system/workspace';
import { Button } from '@/components/ui/button';
import { linkedServiceIdsForSku, linkedSkuIdsForService } from '@/lib/sena-catalog';
import { useInventory } from '@/state/inventory';

export function InventoryRoute() {
  const { catalog } = useInventory();

  if (!catalog) {
    return (
      <WorkspacePage>
        <WorkspaceHero
          eyebrow="Catalog"
          title="Build the SENA catalog"
          description="SKUs, services, bundles, and sharing masks now live in one SENA catalog. Start by adding the first SKU."
          actions={
            <Button asChild>
              <Link to="/catalog/skus/new">New SKU</Link>
            </Button>
          }
        />
        <WorkspaceEmpty
          title="No catalog loaded yet"
          description="Create the first SKU to initialize the local SENA workspace catalog."
          action={
            <Button asChild variant="outline">
              <Link to="/catalog/skus/new">Create first SKU</Link>
            </Button>
          }
        />
      </WorkspacePage>
    );
  }

  return (
    <WorkspacePage>
      <WorkspaceHero
        eyebrow="Catalog"
        title="SENA catalog"
        description="Catalog editing is now SENA-native. Services link to SKUs through the sharing mask rather than the old snapshot recipe model."
        actions={
          <WorkspaceActionRow>
            <Button asChild>
              <Link to="/catalog/skus/new">New SKU</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/catalog/services/new">New service</Link>
            </Button>
          </WorkspaceActionRow>
        }
      />

      <WorkspacePanel title="SKUs" description="Canonical SENA stock-carrying entities.">
        <div className="grid gap-3">
          {catalog.skus.map((sku) => {
            const linkedServices = linkedServiceIdsForSku(catalog, sku.skuId);
            return (
              <div
                key={sku.skuId}
                className="flex flex-col gap-2 rounded-[1.25rem] border border-border/70 bg-background/70 p-4 md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{sku.name}</p>
                  <p className="text-sm text-muted-foreground">{sku.description || 'No description'}</p>
                  <p className="text-xs text-muted-foreground">
                    {linkedServices.length} linked services · cost {sku.costPerUnit}
                  </p>
                </div>
                <WorkspaceActionRow>
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/catalog/skus/${sku.skuId}`}>Detail</Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/catalog/skus/${sku.skuId}/edit`}>Edit</Link>
                  </Button>
                </WorkspaceActionRow>
              </div>
            );
          })}
        </div>
      </WorkspacePanel>

      <WorkspacePanel title="Services" description="Demand-facing services and their SKU mask coverage.">
        <div className="grid gap-3">
          {catalog.services.map((service) => {
            const linkedSkus = linkedSkuIdsForService(catalog, service.serviceId);
            return (
              <div
                key={service.serviceId}
                className="flex flex-col gap-2 rounded-[1.25rem] border border-border/70 bg-background/70 p-4 md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{service.name}</p>
                  <p className="text-sm text-muted-foreground">{service.description || 'No description'}</p>
                  <p className="text-xs text-muted-foreground">
                    {linkedSkus.length} linked SKUs · price {service.price}
                  </p>
                </div>
                <WorkspaceActionRow>
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/catalog/services/${service.serviceId}`}>Detail</Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/catalog/services/${service.serviceId}/edit`}>Edit</Link>
                  </Button>
                </WorkspaceActionRow>
              </div>
            );
          })}
        </div>
      </WorkspacePanel>
    </WorkspacePage>
  );
}
