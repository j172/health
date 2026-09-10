/**
 * Backward compatibility re-export layer for taxOrganizations.
 * Underlying implementation has migrated to NpoOrganizations queries.
 */
export type {
  NpoOrganizationItem as TaxOrganizationItem,
  SearchNpoOrganizationsParams as SearchTaxOrganizationsParams,
} from "@/lib/server/npoOrganizations/queries";

export {
  getRecentNpoOrganizations as getRecentTaxOrganizations,
  countNpoOrganizations as countTaxOrganizations,
  searchNpoOrganizations as searchTaxOrganizations,
  countSearchNpoOrganizations as countSearchTaxOrganizations,
  getNpoOrganizationCities as getTaxOrganizationCities,
} from "@/lib/server/npoOrganizations/queries";
