var https = require('https')
var fs = require('fs')
var Masto = require('mastodon')
var Twit = require('twit')
var auth = require('./auth')

var pref
try {
  pref = JSON.parse(fs.readFileSync('pref.json', 'utf-8'))
} catch (e) {
  // auth process.
  auth()
  return
}

if (pref.twitter.consumer_key === '') {
  console.log('Please add Twitter consumer_key, consumer_secret, access_token, access_token_secret to pref.json.\n')
  process.exit()
}

// instance settings.
let M = new Masto({
  access_token: pref.access_token,
  timeout_ms: 60 * 1000,
  api_url: pref.baseUrl + '/api/v1/'
})

var T = new Twit({
  consumer_key: pref.twitter.consumer_key,
  consumer_secret: pref.twitter.consumer_secret,
  access_token: pref.twitter.access_token,
  access_token_secret: pref.twitter.access_token_secret
})

var user = pref.twitter.userid

var stream = T.stream('user', [user])

stream.on('tweet', (tweet) => {
  if (tweet.user.screen_name === user) {

    // hashtags
    var hashtags = pref.twitter.hashtag;
    if (hashtags.length > 0)
    {
      let isHashtag = false;
      for(let i = 0; i < hashtags.length; i++) {
        if (~tweet.text.indexOf(hashtags[i]))
        {
          isHashtag = true
          break
        }
      }
      if (!isHashtag) return      
    }
  
    // delete twitter url
    var text = tweet.text
    text = text.replace(/https:\/\/t\.co\/.*$/, '')
    
    // check if image or video exists
    if (undefined === tweet.extended_entities.media[0])
     return
    
     // download image first.
    var media = tweet.extended_entities.media[0]
    let ext = '.jpg'
    let media_url = media.media_url_https
    if (undefined !== media.video_info) {
      ext = '.mp4'
      var videoes = media.video_info.variants
      for (let i = 0; i < videoes.length; i++) {
        if (videoes[i].content_type === 'video/mp4')
          media_url = videoes[i].url
      }
    }
    console.log(media_url)
    var tempPath = './temp' + ext
    var image = fs.createWriteStream(tempPath)
    https.get(media_url, (_res) => {
      _res.pipe(image)
    })

    // on finish downloading image
    image.on('finish', () => {
      console.log('downloaded image')
      // post media to mastodon
      M.post('media', { file: fs.createReadStream(tempPath) }).then(resp => {
        const id = resp.data.id

        // post status using media id.
        M.post('statuses', { status: text, media_ids: [id] }).then(resp => {
          console.log('status posted successfully.')
          fs.unlinkSync(tempPath)
          //res.sendStatus(200)
        })
      })
    })
  }
})
