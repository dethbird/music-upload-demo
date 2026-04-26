With those details in mind, I want to make a demo to help me learn.

It should use vite to build a React frontend for 

1. uploading audio with progress / error indication. 
2. Viewing live pubsub activity

The backend should be python FastAPI with `/` reserved for serving up the frontend. And there should be an upload endpoint that does validation and publishes the upload event

It should connect to R2 for the final upload via a worker listening to the events.

For the demo, we can just use Redis even though in a true production environment we would use GCP.

The code should be organized such that the server code lives in project root. UI code should be in `/ui` and the build output should go somewhere that FastAPI can serve it from `/`. Workers, database, and event publisher should also be correctly organized.

Can you plan this please.