const fs = require('fs');
const readline = require('readline');
const {google} = require('googleapis');

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = '.gmail_credentials';

const QUERY = process.argv[2];

// Load client secrets from a local file.
fs.readFile('client_secret.json', (err, content) => {
  if (err) return console.log('Error loading client secret file:', err);
  // Authorize a client with credentials, then call the Gmail API.
  authorize(JSON.parse(content), listMessages);
});

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback) {
  const {client_secret, client_id, redirect_uris} = credentials.web;
  const oAuth2Client = new google.auth.OAuth2(
      client_id, client_secret, redirect_uris[0]);

  // Check if we have previously stored a token.
  fs.readFile(TOKEN_PATH, (err, token) => {
    if (err) return getNewToken(oAuth2Client, callback);
    oAuth2Client.setCredentials(JSON.parse(token));
    callback(oAuth2Client);
  });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback for the authorized client.
 */
function getNewToken(oAuth2Client, callback) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  console.log('Authorize this app by visiting this url:', authUrl);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.question('Enter the code from that page here: ', (code) => {
    rl.close();
    oAuth2Client.getToken(code, (err, token) => {
      if (err) return console.error('Error retrieving access token', err);
      oAuth2Client.setCredentials(token);
      // Store the token to disk for later program executions
      fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
        if (err) return console.error(err);
        console.log('Token stored to', TOKEN_PATH);
      });
      callback(oAuth2Client);
    });
  });
}

/**
 * Lists the labels in the user's account.
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
function listMessages(auth) {
  const gmail = google.gmail({version: 'v1', auth});
  const payloads = [];
  listMessagesHelper(gmail,QUERY).then(data => {
    let p = Promise.resolve();
    data.forEach(d => {
      p = p.then(() => {
        return new Promise((resolve, reject) => {
          setTimeout(() => {
            getMessage(gmail, d.id).then(data => {
              resolve(data);
            })
          }, 1000);
        })
      }).then(payload => {
        payloads.push(payload);
      });
    });
    return p;
  }).then(() => {
    console.log(JSON.stringify(payloads,null,2));
  }).catch(err => {
    console.log(`listMessages failed; error=${err.stack}`)
  });
}

let listMessagesHelper = (gmail,query,conToken) => {
  const req = {
    userId: 'me'
  };
  if (QUERY) {
    req.q = QUERY;
  }
  if (conToken) {
    req.pageToken = conToken;
  }
  return new Promise((resolve,reject) => {
    gmail.users.messages.list(req, (err, res) => {
      if (err) {
        reject(err);
      };
      resolve(res.data);
    });
  }).then(data => {
    const messages = [];
    data.messages.forEach(m => {
      messages.push(m);
    });
    if (data.nextPageToken) {
      return listMessagesHelper(gmail,query,data.nextPageToken).then(data => {
        data.forEach(d => {
          messages.push(d);
        });
        return messages;
      });
    }
    return messages;
  });
};

let getMessage = (gmail,mid) => {
  return new Promise((resolve,reject) => {
    gmail.users.messages.get({
      id: mid,
      userId: 'me'
    }, (err, resp) => {
      if (err) {
        reject(err);
      }
      resolve(resp.data.payload);
    });
  });
}


