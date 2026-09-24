const axios = require('axios');

const shyamFoodApi =axios.create({
    baseURL:process.env.OLD_BACKEND_URL,
    timeout:15000,
});

module.exports =shyamFoodApi;