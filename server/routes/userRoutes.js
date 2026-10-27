const express = require('express')
const userController = require('../controllers/userController')
const { verify } = require('../auth')

const router = express.Router()

router.post("/register", userController.registerUser)
router.post("/login", userController.loginUser)
router.get("/details", verify, userController.getProfile)
router.patch("/update-password", verify, userController.resetPassword)

module.exports = router;