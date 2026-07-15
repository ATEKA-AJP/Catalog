/**
 * ==========================================
 * AJP WEB CATALOG
 * Global Constants
 * ==========================================
 */

const ACTIONS = Object.freeze({

    PRODUCTS: "products",

    VERIFY: "verify",

    CREATE_ORDER: "createOrder",

    UPLOAD_PREVIEW: "uploadPreview",

    UPLOAD_IMPORT: "uploadImport",

    GET_MAPPING: "getMapping",

    GET_UNMAPPED: "getUnmapped",

    SAVE_MAPPING: "saveMapping",

    UPDATE_MAPPING: "updateMapping",

    UPDATE_UNMAPPED: "updateUnmapped",

    GET_USERS: "getUsers",

    SAVE_USER: "saveUser",

    GUEST_LOGIN: "guestLogin",

    GENERATE_SHARE_LINK: "generateShareLink",

    REVOKE_SHARE_LINK: "revokeShareLink"

});

const ORDER_STATUS = Object.freeze({

    PENDING: "pending",

    REVIEW: "review",

    SENT: "sent"

});

const USER_ROLE = Object.freeze({

    PUBLIC: "public",

    GUEST: "guest",

    SALES: "sales",

    SUPERVISOR: "supervisor",

    ADMIN: "admin"

});