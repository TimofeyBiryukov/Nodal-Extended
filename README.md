
# Nodal Extended

Nodal Extended is the project that extends NodalJS functionality

Original project -> https://github.com/keithwhor/nodal

## Nodal Extended Features:

* [app.js]()
* Local JSON Configuration
* Socket Server
* Socket REST API
* Socket PubSub models
* Access Control List model
* Controllers methods: `respondOne`, `respondPlain`, `respondRaw`, `respondStream`
* Controllers methods binding to a route (used to be able to only bind whole controller to a route)

## app.js

Nodal Extended adds app.js to project blueprint, this makes it easier to run server however you like and implement load balancing and process communications in a conventional manner.
For example web-storm node.js debugger could be attached now and used as with any other node.js single process servers.

Run server

```
node app
```

## Local JSON Configuration

Nodal Extended includes local json configuration option, see `config/local.json.example` for a configuration example.
Local json config will override all or any provided configurations, giving you an ability to precisely configure your local or server setup without need to use env vars.

Create local.json

```
cp config/local.json.example config/local.json
```

Adding any config parameter to local.json will override that exact parameter at runtime.
For example, your secrets.json looks like this:

```
{

  "development": {
    "port": 3000
  },

  "production": {
    "port": "{{= env.PORT }}"
  }

}

```

Now you have port 3000 occupied on your network, but changing development.port in secrets.json will change the port for everyone who is using the project.
You can add your local config to `local.json`

```
{
  "secrets": {
    "development": {
      "port": 3001
    }
  }
}
```

`Nodal.my.Config.secrets` will look like this

```
{ port: 3001 }
```

Another example - you want to test production environment locally
Your db.json:

```
{
  "production": {
    "main": {
      "adapter": "postgres",
      "connectionString": "{{= env.DATABASE_URL }}"
    }
  }
}
```

Update only the params you want to be different in local.json

```
{
  "db": {
    "production": {
      "main": {
        "connectionString": "postgresql://dbuser:secretpassword@database.server.com:3211/mydb"
      }
    }
  }
}
```

When running with NODE_ENV=production `Nodal.my.Config.db.main` will look like this

```
{"adapter": "postgres", "connectionString": "postgresql://dbuser:secretpassword@database.server.com:3211/mydb"}
```

Notice that "adapter" was inherited unchanged from default configuration but "connectionString" got overridden by local.json

`local.json` is ignored by git so you can store all your secrets and setup specific configuration and it will not end up in your repo.




