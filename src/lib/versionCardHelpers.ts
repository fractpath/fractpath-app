export interface VersionBadgeStyle {
  label: string;
  className: string;
}

export function getVersionBadgeStyle(versionType: string | undefined): VersionBadgeStyle {
  switch (versionType) {
    case "OFFER":
      return {
        label: "Offer",
        className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
      };
    case "COUNTER":
      return {
        label: "Counter",
        className: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
      };
    case "ACCEPT":
      return {
        label: "Accepted",
        className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      };
    case "REJECT":
      return {
        label: "Rejected",
        className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
      };
    default:
      return {
        label: "Version",
        className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
      };
  }
}
