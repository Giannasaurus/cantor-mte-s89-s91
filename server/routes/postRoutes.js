const express = require('express')
const postController = require('../controllers/postController')
const { verify } = require('../auth')

const router = express.Router()

router.get("/", verify, postController.getPosts)
router.post("/", verify, postController.createPost)
router.get("/mine", verify, postController.getMyPosts)
router.get("/:postId", verify, postController.getPost)
router.patch("/:postId", verify, postController.updatePost)
router.delete("/:postId", verify, postController.deletePost)

module.exports = router;