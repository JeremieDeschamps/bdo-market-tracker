import axios from 'axios';

export class MarketApiClient {
    constructor() {
        this.baseUrl = 'https://api.arsha.io/v2/na';
        
        this.config = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'application/json'
            }
        };
    }

    async fetchCategory(mainCatId, subCatId = 1) {
        try {
            // Changement ici : on utilise mainCategory et subCategory
            // Exemple pour les matériaux : mainCategory=35&subCategory=1
            const url = `${this.baseUrl}/category?mainCategory=${mainCatId}&subCategory=${subCatId}`;
            
            const response = await axios.get(url, this.config);
            return response.data;
        } catch (error) {
            console.error(`Erreur API :`, error.response?.data || error.message);
            return null;
        }
    }
    
    async fetchItemData(itemId) {
        try {
            const url = `${this.baseUrl}/item?id=${itemId}`;
            const response = await axios.get(url, this.config);
            return response.data;
        } catch (error) {
            console.error(`Erreur API (Item ${itemId}) :`, error.response?.data || error.message);
            return null;
        }
    }

    async fetchCategory(mainCatId, subCatId) {
    try {
        const url = `${this.baseUrl}/category?mainCategory=${mainCatId}&subCategory=${subCatId}`;
        const response = await axios.get(url, this.config);
        return response.data;
    } catch (error) {
        // On ne console.error QUE si ce n'est pas une erreur 400 (catégorie vide)
        // Ça évite de polluer ton terminal avec des milliers de messages rouges
        if (error.response && error.response.status !== 400) {
            console.error(`Erreur API (${mainCatId}-${subCatId}) :`, error.response.status);
        }
        return null;
    }
}
}