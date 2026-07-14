/**
 * ==========================================
 * Logout
 * ==========================================
 */

const Logout = {

    async logout() {

        await SessionStorage.clear();

        return true;

    }

};