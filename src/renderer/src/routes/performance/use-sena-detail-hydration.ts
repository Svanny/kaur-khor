import { useEffect, useState } from 'react';
import { useInventory } from '@/state/inventory';

export function useSenaDetailHydration() {
  const inventory = useInventory();
  const [skuDetailsById, setSkuDetailsById] = useState<Record<string, Awaited<ReturnType<typeof inventory.loadSenaSkuDetail>>>>({});
  const [serviceDetailsById, setServiceDetailsById] = useState<Record<string, Awaited<ReturnType<typeof inventory.loadSenaServiceDetail>>>>({});
  const [isHydratingDetails, setIsHydratingDetails] = useState(false);

  useEffect(() => {
    if (!inventory.catalog || !inventory.workspaceSummary) {
      setSkuDetailsById({});
      setServiceDetailsById({});
      setIsHydratingDetails(false);
      return;
    }

    let active = true;
    setIsHydratingDetails(true);

    void Promise.all([
      Promise.all(
        inventory.catalog.skus.map(async (sku) => {
          try {
            return [sku.skuId, await inventory.loadSenaSkuDetail(sku.skuId)] as const;
          } catch {
            return [sku.skuId, null] as const;
          }
        }),
      ),
      Promise.all(
        inventory.catalog.services.map(async (service) => {
          try {
            return [service.serviceId, await inventory.loadSenaServiceDetail(service.serviceId)] as const;
          } catch {
            return [service.serviceId, null] as const;
          }
        }),
      ),
    ])
      .then(([skuEntries, serviceEntries]) => {
        if (!active) {
          return;
        }
        setSkuDetailsById(Object.fromEntries(skuEntries));
        setServiceDetailsById(Object.fromEntries(serviceEntries));
        setIsHydratingDetails(false);
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setIsHydratingDetails(false);
      });

    return () => {
      active = false;
    };
  }, [inventory, inventory.catalog, inventory.workspaceSummary]);

  return {
    isHydratingDetails,
    serviceDetailsById,
    skuDetailsById,
  };
}
